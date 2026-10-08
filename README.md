# 3000 Từ Vựng Tiếng Anh – Học thông minh

Web học 3000 từ vựng tiếng Anh thông dụng (danh sách Oxford 3000, có phiên âm và nghĩa tiếng Việt), chạy hoàn toàn trên trình duyệt, không cần đăng nhập.

Giao diện kế thừa từ web ôn tập trắc nghiệm FE; phần học từ vựng được viết mới.

## Các cách học

| Chế độ | Mục đích |
| --- | --- |
| 🃏 Flashcard | Tự chấm *Quên / Khó / Nhớ / Dễ*; mỗi nút ghi rõ lần ôn kế tiếp theo lịch FSRS |
| 🎲 Trộn ngẫu nhiên | Tự chọn dạng bài theo mức độ nhớ: từ mới → nhận diện, từ đã quen → tự nhớ lại |
| 🔤 Anh → Việt · 💬 Việt → Anh | Trắc nghiệm 4 đáp án (đáp án nhiễu cùng từ loại, cùng chủ đề) |
| 🎧 Nghe chọn từ | Nghe phát âm, chọn đúng từ (đáp án nhiễu có cách viết gần giống) |
| ✍️ Gõ từ · 📝 Nghe – viết | Tự gõ lại từ; dùng gợi ý thì lượt đó tính là “Khó” |
| 🔀 Chính tả 2 chọn 1 | Điền khuyết: chọn cách viết đúng giữa từ thật và một lỗi chính tả hay gặp |
| 🧬 Dạng từ | Biến đổi từ trong cùng họ: chọn dạng danh/động/tính/trạng từ |
| 📄 Điền vào câu | Câu ví dụ thật (Wiktionary) bị khoét trống từ cần học; chọn 1 trong 4 từ. Tải sẵn câu cho các từ sắp tới; offline hoặc từ không có ví dụ thì chuyển sang Việt → Anh |
| ⚡ Đúng / Sai nhanh · 🧩 Ghép cặp | Luyện phản xạ, trò chơi ghép 6 cặp từ – nghĩa |
| 🎙 Luyện phát âm | Đọc to, trình duyệt nhận dạng giọng nói để chấm (Chrome / Edge) |
| 📂 Nhóm từ | Học theo **chủ đề**, **họ từ** hoặc **bộ từ tự tạo** |
| 📖 Danh sách · 📊 Thống kê | Tra cứu (cả ghi chú), xuất CSV (Excel / Anki); dự báo lịch ôn, lịch học, tỉ lệ nhớ thực tế, hiệu quả từng cách học |

**Câu ví dụ tiếng Anh**: sau mỗi câu, phần thông tin từ tự tải câu ví dụ / định nghĩa từ Wiktionary (REST API) và, nếu có, giọng đọc thu âm từ Free Dictionary API. Chỉ chính từ tiếng Anh được gửi đi; tắt được trong ⚙️. Mạng chập chờn thì hiện nút *Thử lại*, các chế độ học vẫn chạy bình thường khi offline.

## Phân loại từ

- **Chủ đề** (~30 nhóm): thời gian, con người, cơ thể & sức khỏe, ăn uống, công việc, tiền bạc, giao thông, thiên nhiên, cảm xúc, tư duy… Mỗi từ thuộc một chủ đề chính.
  Danh sách nằm ở `tools/topics.py`; từ chưa có trong danh sách nào được xếp theo từ loại hoặc theo chủ đề của từ cùng họ.
- **Họ từ** (word family, ~530 họ): nối các từ phái sinh như *success → successful → successfully → unsuccessful*, có danh sách chặn các cặp chỉ giống mặt chữ (*card/car*, *should/shoulder*…).
- **Bộ từ của tôi**: tự tạo, thêm/bớt từ ngay ở phần thông tin từ; kèm sẵn ★ Đánh dấu và 🐛 Từ cứng đầu (quên ≥ 4 lần).
- **Đã biết / Ẩn từ**: nút *✓ Biết rồi* trên flashcard từ mới (chấm “Dễ”, hẹn kiểm tra lại sau ~2 tuần thay vì học từ đầu); *🚫 Ẩn từ này* loại từ khỏi các phiên học, khôi phục trong nhóm 🚫 Từ đã ẩn.

## Lưu tiến độ

- Lịch ôn dùng **FSRS 4.5** (thuật toán Anki dùng từ 2023) với tham số mặc định. Mỗi từ có *độ bền* (S – số ngày đến khi xác suất nhớ còn 90%) và *độ khó* (D). Lịch ôn đặt để bạn ôn đúng lúc xác suất nhớ chạm mức mong muốn (mặc định 90%, chỉnh 80–97% trong ⚙️). Từ mới đi qua các bước 1 phút → 10 phút trong phiên rồi mới chuyển sang lịch theo ngày.
- Các chế độ luyện tập được quy đổi sang điểm FSRS: sai = Quên; đúng = Nhớ (chậm > 15 giây hoặc dùng gợi ý = Khó). Đúng khi chưa đến hạn chỉ được ghi nhận, không đẩy lịch ôn. Lỗi nhận dạng giọng nói không bị tính là quên.
- Tiến độ lưu theo **chính từ** (không theo số thứ tự) nên cập nhật dữ liệu không làm lệch tiến độ. Tiến độ của bản đầu tiên tự chuyển sang khi mở trang (dùng `data/legacy_v1.json`).
- Có **nhật ký từng lượt trả lời** (tối đa 30.000 lượt), dùng để tính tỉ lệ nhớ thực tế và hiệu quả từng cách học.
- “Ngày học” bắt đầu lúc 4 giờ sáng (chỉnh được). Có giới hạn số từ mới và số lượt ôn mỗi ngày.
- Hoàn tác lượt trả lời (↶ / Ctrl+Z); tự lưu bản sao mỗi ngày để khôi phục; xin trình duyệt lưu bền vững.
- Xuất / nhập file JSON. **Nhập & gộp** giữ bản ôn gần nhất của từng từ, nên học trên nhiều máy rồi gộp lại không mất dữ liệu.

## Cài như ứng dụng (PWA), học offline

- **Android / máy tính (Chrome, Edge):** nút **📲 Cài app** trên thanh trên cùng (hoặc menu ⋮ → *Cài đặt ứng dụng*).
- **iPhone / iPad (Safari):** Chia sẻ → *Thêm vào MH chính*.
- `sw.js` lưu sẵn trang, CSS/JS, dữ liệu từ vựng và biểu tượng; sau lần mở đầu tiên web chạy được khi không có mạng.
  Danh sách file được đọc từ `index.html` nên chỉ cần đổi số phiên bản `?v=` khi cập nhật.
- Biểu tượng tạo bằng `python tools/make_icons.py` (cần Pillow).

## Chạy trên máy

```bash
python -m http.server 8000
```

Mở `http://localhost:8000`. (Không mở trực tiếp file `index.html` vì trình duyệt chặn đọc JSON.)

## Kiểm thử

```bash
npm test
```

(hoặc `node --test "tests/*.test.js"`, cần Node 18+). Gồm:

- `tests/srs.test.js`: bộ lập lịch FSRS (các bước học, thứ tự nút, xác suất nhớ đúng mục tiêu, quên, giới hạn, fuzz).
- `tests/lib.test.js`: chấm đáp án gõ tay (bỏ qua dấu câu/hoa thường, cách viết trong ngoặc như *arrive (at, in)*, kiểm tra trên toàn bộ dữ liệu).
- `tests/data.test.js`: dữ liệu (khóa không trùng, nghĩa/từ loại/chủ đề hợp lệ, họ từ không chồng chéo, các lỗi PDF đã sửa, bảng chuyển tiến độ bản 1).

## Tạo lại dữ liệu

`data/vocab.json` (từ, chủ đề, họ từ) và `data/legacy_v1.json` được tạo từ file PDF:

```bash
pip install pymupdf
python tools/build_vocab.py "duong/dan/3000.pdf"
```

- `tools/parse_pdf.py`: đọc PDF (hai kiểu bố cục) và sửa tay các dòng lệch cột (`FIX`).
- `tools/build_vocab.py`: gộp mục trùng, sửa mục lỗi (`MERGE`, `EDIT`), xếp chủ đề, tìm họ từ.
- `tools/topics.py`: danh sách chủ đề.

## Nguồn dữ liệu

Danh sách từ Oxford 3000 kèm phiên âm và nghĩa tiếng Việt lấy từ tài liệu “3000 từ vựng tiếng Anh thông dụng nhất” của Effortless English Club. Dữ liệu chỉ dùng cho mục đích học tập.
