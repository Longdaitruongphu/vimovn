const fs = require('fs');
const path = require('path');

async function run() {
    // Tự động nhận diện cả key tên GEMINI_API_KEY lẫn OPENAI_API_KEY mà bạn đã tạo trên GitHub
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Lỗi: Không tìm thấy API Key trong GitHub Secrets");
        process.exit(1);
    }

    const skillContent = fs.readFileSync(path.join(__dirname, '../SKILL.md'), 'utf-8');

    const date = new Date();
    const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const folderPath = path.join(__dirname, '..', folderName);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
    const reportPath = path.join(folderPath, 'report.json');

    console.log(`Đang gọi Google Gemini API...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Bạn là hệ thống cào và phân tích dữ liệu vĩ mô Việt Nam. Hãy thực hiện toàn bộ các yêu cầu, quy tắc và cấu trúc được mô tả trong tài liệu sau để tạo ra file dữ liệu JSON chuẩn cho tháng ${folderName}:\n\n${skillContent}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            console.error("Lỗi từ Google Gemini API:", JSON.stringify(data, null, 2));
            process.exit(1);
        }

        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) {
            console.error("Lỗi: Không nhận được nội dung trả về từ Gemini", JSON.stringify(data, null, 2));
            process.exit(1);
        }

        let jsonString = candidate.trim();
        jsonString = jsonString.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        fs.writeFileSync(reportPath, jsonString, 'utf-8');
        console.log(`Đã cập nhật dữ liệu thành công vào: ${reportPath}`);
    } catch (err) {
        console.error("Lỗi kết nối:", err);
        process.exit(1);
    }
}

run();