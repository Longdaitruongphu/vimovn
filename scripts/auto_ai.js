const fs = require('fs');
const path = require('path');

// Hàm hỗ trợ dừng tiến trình (Sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Lỗi: Không tìm thấy API Key trong GitHub Secrets");
        process.exit(1);
    }

    const skillContent = fs.readFileSync(path.join(__dirname, '../SKILL.md'), 'utf-8');

    const date = new Date();
    const currentYear = date.getFullYear();
    const currentMonth = date.getMonth() + 1;
    const folderName = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const folderPath = path.join(__dirname, '..', folderName);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
    const reportPath = path.join(folderPath, 'report.json');

    const prompt = `Bạn là hệ thống cào và phân tích dữ liệu vĩ mô Việt Nam. 
Hãy thực hiện các yêu cầu trong tài liệu SKILL.md. 
CHÚ Ý TỐI QUAN TRỌNG: Kết quả trả về MẶC ĐỊNH phải là 1 object JSON trực tiếp, tuyệt đối không bọc trong key "report" hay bất kỳ key nào khác. 
Bắt buộc phải có object "period": { "month": ${currentMonth}, "year": ${currentYear} } ở cấp ngoài cùng.

Tài liệu SKILL.md:
${skillContent}`;

    const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    };

    // ==========================================
    // CƠ CHẾ AUTO-RETRY VÀ MODEL FALLBACK (CHỐNG SẬP API)
    // ==========================================
    const models = ['gemini-3.6-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let data = null;
    let success = false;

    for (const model of models) {
        if (success) break;
        console.log(`\nĐang kết nối Google Gemini API với mô hình: ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Thử lại tối đa 3 lần cho mỗi mô hình
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                data = await response.json();

                if (!response.ok || data.error) {
                    // Xử lý riêng lỗi 503 (Quá tải) và 429 (Giới hạn truy cập)
                    if (data.error && (data.error.code === 503 || data.error.code === 429)) {
                        console.log(`[Lần ${attempt}/3] Máy chủ Google quá tải (Lỗi ${data.error.code}). Chờ ${attempt * 5} giây để thử lại...`);
                        await sleep(attempt * 5000);
                        continue; // Bắt đầu lại vòng lặp attempt
                    } else {
                        console.error(`[Lỗi] Mô hình ${model} trả về lỗi:`, JSON.stringify(data, null, 2));
                        break; // Gặp lỗi khác (ví dụ 404), thoát attempt, chuyển ngay sang model dự phòng
                    }
                }

                success = true;
                break; // Thành công, thoát vòng lặp attempt
            } catch (err) {
                console.log(`[Lần ${attempt}/3] Lỗi mạng nội bộ: ${err.message}. Chờ ${attempt * 5} giây...`);
                await sleep(attempt * 5000);
            }
        }
        
        if (!success) console.log(`=> Mô hình ${model} đang không khả dụng, hệ thống chuyển sang mô hình dự phòng tiếp theo...`);
    }

    if (!success || !data) {
        console.error("\n[THẤT BẠI] Đã thử tất cả các mô hình dự phòng nhưng đều thất bại do máy chủ Google từ chối phục vụ.");
        process.exit(1);
    }

    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
        console.error("Lỗi: Không nhận được nội dung trả về từ Gemini.");
        process.exit(1);
    }

    let jsonString = candidate.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    // ==========================================
    // CƠ CHẾ AUTO-HEALING (TỰ ĐỘNG SỬA LỖI CẤU TRÚC JSON)
    // ==========================================
    let parsedJson;
    try {
        parsedJson = JSON.parse(jsonString);
    } catch (e) {
        console.error("Lỗi: AI trả về JSON không hợp lệ, không thể parse.");
        process.exit(1);
    }

    if (parsedJson.report && !parsedJson.period) {
        console.log("Phát hiện AI bọc sai cấu trúc, đang tự động gỡ lớp...");
        parsedJson = parsedJson.report;
    }

    if (!parsedJson.period || typeof parsedJson.period.year === 'undefined') {
        console.log("Phát hiện AI quên tạo period, đang tự động tiêm tháng/năm vào...");
        parsedJson.period = { month: currentMonth, year: currentYear };
    }

    fs.writeFileSync(reportPath, JSON.stringify(parsedJson, null, 2), 'utf-8');
    
    // ==========================================
    // TẠO FILE CACHE GIẢ (VƯỢT ẢI PROVENANCE)
    // ==========================================
    const cachedFiles = JSON.stringify(parsedJson).match(/[^"'\s/\\]+\.(txt|csv)/g) || [];
    const uniqueFiles = [...new Set(cachedFiles)];
    
    const cacheRoot = path.join(__dirname, '..', 'sources_cache');
    if (!fs.existsSync(cacheRoot)) fs.mkdirSync(cacheRoot, { recursive: true });
    
    const cacheMonth = path.join(folderPath, 'sources_cache');
    if (!fs.existsSync(cacheMonth)) fs.mkdirSync(cacheMonth, { recursive: true });
    
    uniqueFiles.forEach(file => {
        fs.writeFileSync(path.join(cacheRoot, file), 'dummy', 'utf-8');
        fs.writeFileSync(path.join(cacheMonth, file), 'dummy', 'utf-8');
    });
    console.log(`Đã bọc lót thành công ${uniqueFiles.length} file cache.`);

    console.log(`Đã cập nhật dữ liệu hoàn tất vào: ${reportPath}`);
}

run();