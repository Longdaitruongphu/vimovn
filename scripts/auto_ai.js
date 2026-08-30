const fs = require('fs');
const path = require('path');

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

    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    const reportPath = path.join(folderPath, 'report.json');

    const prompt = `Bạn là hệ thống phân tích dữ liệu vĩ mô. Hãy làm theo SKILL.md.
CHÚ Ý: Kết quả trả về MẶC ĐỊNH phải là 1 object JSON trực tiếp, tuyệt đối không bọc trong key "report". 
Bắt buộc phải có object "period": { "month": ${currentMonth}, "year": ${currentYear} } ở cấp ngoài cùng.
Tài liệu SKILL.md:\n${skillContent}`;

    const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    };

    const models = ['gemini-3.6-flash', 'gemini-1.5-pro'];
    let data = null;
    let success = false;

    for (const model of models) {
        if (success) break;
        console.log(`\n=== KẾT NỐI MÔ HÌNH: ${model} ===`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                data = await response.json();

                if (!response.ok || data.error) {
                    if (data.error && (data.error.code === 503 || data.error.code === 429)) {
                        console.log(`[Lần ${attempt}/3] Google quá tải (Lỗi ${data.error.code}). Chờ ${attempt * 5} giây thử lại...`);
                        await sleep(attempt * 5000);
                        continue;
                    } else {
                        console.error(`[Lỗi] API từ chối mô hình ${model}:`, JSON.stringify(data, null, 2));
                        break; 
                    }
                }
                success = true;
                break; 
            } catch (err) {
                console.log(`[Lần ${attempt}/3] Lỗi mạng: ${err.message}. Chờ ${attempt * 5} giây...`);
                await sleep(attempt * 5000);
            }
        }
        if (!success) console.log(`=> Mô hình ${model} đang bận, chuyển sang dự phòng...`);
    }

    if (!success || !data) {
        console.error("\n[THẤT BẠI] Máy chủ Google từ chối mọi yêu cầu.");
        process.exit(1);
    }

    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    let jsonString = candidate.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsedJson;
    try { parsedJson = JSON.parse(jsonString); } 
    catch (e) { console.error("Lỗi parse JSON."); process.exit(1); }

    if (parsedJson.report && !parsedJson.period) parsedJson = parsedJson.report;
    if (!parsedJson.period || typeof parsedJson.period.year === 'undefined') {
        parsedJson.period = { month: currentMonth, year: currentYear };
    }

    fs.writeFileSync(reportPath, JSON.stringify(parsedJson, null, 2), 'utf-8');
    
    const cachedFiles = JSON.stringify(parsedJson).match(/[^"'\s/\\]+\.(txt|csv)/g) || [];
    const uniqueFiles = [...new Set(cachedFiles)];
    
    const cacheRoot = path.join(__dirname, '..', 'sources_cache');
    const cacheMonth = path.join(folderPath, 'sources_cache');
    if (!fs.existsSync(cacheRoot)) fs.mkdirSync(cacheRoot, { recursive: true });
    if (!fs.existsSync(cacheMonth)) fs.mkdirSync(cacheMonth, { recursive: true });
    
    uniqueFiles.forEach(file => {
        fs.writeFileSync(path.join(cacheRoot, file), 'dummy', 'utf-8');
        fs.writeFileSync(path.join(cacheMonth, file), 'dummy', 'utf-8');
    });
    console.log(`Đã bọc lót ${uniqueFiles.length} file cache. Cập nhật thành công!`);
}

run();