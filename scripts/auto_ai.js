const fs = require('fs');
const path = require('path');

async function run() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Lỗi: Không tìm thấy OPENAI_API_KEY");
        process.exit(1);
    }

    // Đọc hướng dẫn từ file SKILL.md
    const skillContent = fs.readFileSync(path.join(__dirname, '../SKILL.md'), 'utf-8');

    // Tạo tên thư mục theo tháng hiện tại (VD: 2026-08)
    const date = new Date();
    const folderName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const folderPath = path.join(__dirname, '..', folderName);

    // Tạo thư mục nếu chưa có
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
    }
    const reportPath = path.join(folderPath, 'report.json');

    console.log(`Đang gọi OpenAI API...`);

    // Gửi yêu cầu cho ChatGPT
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                { 
                    role: "system", 
                    content: "Bạn là hệ thống cào và phân tích dữ liệu vĩ mô. Hãy làm theo hướng dẫn. CHỈ trả về dữ liệu thuần định dạng JSON, không giải thích, không kèm Markdown block (```json)." 
                },
                { 
                    role: "user", 
                    content: `Thực hiện hướng dẫn sau để lấy dữ liệu mới nhất của tháng hiện tại:\n\n${skillContent}` 
                }
            ],
            temperature: 0.2
        })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]) {
        let jsonString = data.choices[0].message.content;
        // Dọn dẹp nếu AI lỡ xuất kèm markdown
        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

        // Ghi đè vào file report.json
        fs.writeFileSync(reportPath, jsonString);
        console.log(`Đã cập nhật dữ liệu thành công vào: ${reportPath}`);
    } else {
        console.error("Lỗi từ API của AI:", JSON.stringify(data, null, 2));
        process.exit(1);
    }
}

run();