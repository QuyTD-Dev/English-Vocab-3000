# 3000 Từ Vựng Tiếng Anh – Học thông minh

Web học 3000 từ vựng tiếng Anh thông dụng (danh sách Oxford 3000, có phiên âm và nghĩa tiếng Việt), chạy hoàn toàn trên trình duyệt, không cần đăng nhập.

Giao diện kế thừa từ web ôn tập trắc nghiệm FE; phần học từ vựng được viết mới.

## Các cách học

| Chế độ | Mục đích |
| --- | --- |
| 🃏 Flashcard | Lặp lại ngắt quãng (Leitner): tự chấm *Quên / Khó / Nhớ / Dễ*, từ nhớ chắc sẽ giãn lịch ôn 1 → 2 → 4 → 7 → 15 → 30 → 60 ngày |
| 🔤 Anh → Việt | Trắc nghiệm 4 đáp án, chọn nghĩa đúng |
| 💬 Việt → Anh | Trắc nghiệm 4 đáp án, nhớ ra từ tiếng Anh |
| 🎧 Nghe chọn từ | Nghe phát âm, chọn đúng từ (đáp án nhiễu có cách viết gần giống) |
| ✍️ Gõ từ | Xem nghĩa, gõ lại từ, có gợi ý từng chữ cái |
| 📝 Nghe – viết | Nghe rồi gõ chính tả, có nút đọc chậm |
| 🔀 Chính tả 2 chọn 1 | Điền khuyết: chọn cách viết đúng giữa từ thật và một lỗi chính tả hay gặp |
| ⚡ Đúng / Sai nhanh | Luyện phản xạ cặp từ – nghĩa, có đếm chuỗi đúng |
| 🧩 Ghép cặp | Ghép 6 từ với 6 nghĩa, tính thời gian và số lần nhầm |
| 🎙 Luyện phát âm | Đọc to, trình duyệt nhận dạng giọng nói để chấm (Chrome / Edge) |
| 📖 Danh sách | Tra cứu theo từ hoặc nghĩa (gõ không dấu được), nghe, đánh dấu ★ |
| 📊 Thống kê | Số từ đã học / đã thuộc, độ chính xác, chuỗi ngày, biểu đồ 14 ngày, từ hay sai |

**Phạm vi học**: Hôm nay (từ đến hạn ôn + số từ mới mỗi ngày), theo bài 30 từ (114 bài), chưa học, đang học, cần ôn, hay sai, đánh dấu, đã thuộc; lọc thêm theo từ loại.

Tiến độ lưu trong trình duyệt (localStorage); có thể xuất/nhập file JSON để chuyển máy. Phát âm dùng giọng đọc có sẵn của trình duyệt (chọn giọng Mỹ/Anh và tốc độ trong ⚙️).

## Chạy trên máy

```bash
python -m http.server 8000
```

Mở `http://localhost:8000`. (Không mở trực tiếp file `index.html` vì trình duyệt chặn đọc JSON.)

## Cập nhật dữ liệu

`data/vocab.json` được tạo từ file PDF bằng:

```bash
pip install pymupdf
python tools/parse_pdf.py "duong/dan/3000.pdf"
```

Các dòng PDF bị lệch cột được sửa tay trong biến `FIX` của `tools/parse_pdf.py`.

## Nguồn dữ liệu

Danh sách từ Oxford 3000 kèm phiên âm và nghĩa tiếng Việt lấy từ tài liệu “3000 từ vựng tiếng Anh thông dụng nhất” của Effortless English Club. Dữ liệu chỉ dùng cho mục đích học tập.
