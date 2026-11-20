# Meetle Recorder

Extension Chrome ghi hình buổi học trên **Google Meet** của [englishmaile.com](https://englishmaile.com): ghi cả hình, giọng học viên và giọng giáo viên, rồi tự upload lên Google Drive.

Ghi ngay trong trình duyệt của giáo viên nên không cần ai vào phòng thêm. Lớp 1-1 vẫn là cuộc gọi 2 người, không dính giới hạn 60 phút của Meet dành cho cuộc gọi từ 3 người.

## Cài đặt (giáo viên)

1. **[Tải bản mới nhất](https://github.com/chavisnguyen/meetle-extension/releases/latest/download/meetle-recorder.zip)** và giải nén vào một thư mục cố định (đừng xoá thư mục này, Chrome đọc extension từ đó).
2. Mở `chrome://extensions`, bật **Developer mode** (góc trên bên phải).
3. Bấm **Load unpacked** và chọn thư mục vừa giải nén.
4. Bấm biểu tượng ghim extension lên thanh công cụ cho tiện.

Chrome sẽ hiện cảnh báo "extension chế độ nhà phát triển" mỗi lần mở trình duyệt. Bình thường, cứ đóng đi.

## Dùng

1. Bấm biểu tượng extension, chọn **Đăng nhập bằng Google** bằng tài khoản Google của giáo viên. Email này phải có trong danh sách giáo viên đang dạy do admin quản lý, nếu không popup sẽ báo lỗi.
2. Mở tab Meet của buổi học và bấm biểu tượng extension. Popup nhận ra lớp và gợi ý buổi học gần giờ nhất; nếu sai thì chọn lại.
3. Bấm **Ghi lại tab này**. Lần đầu Chrome hỏi quyền micro: cho phép rồi bấm lại.
4. Học xong bấm **Dừng & upload** và chờ "Đã upload lên Drive". Đóng tab Meet giữa chừng cũng tự dừng và upload.

Meet không thuộc lớp nào trong hệ thống vẫn ghi được. Popup sẽ cảnh báo và bản ghi vào thư mục **Other** trên Drive.

Trình duyệt tắt đột ngột hay mất mạng: video vẫn nằm trong Chrome và tự upload tiếp ở lần mở Chrome sau.

## Cập nhật

Extension không tự cập nhật. Chân popup ghi số phiên bản đang cài. Có bản mới thì tải lại file zip ở trên, giải nén đè lên thư mục cũ rồi bấm biểu tượng reload của extension ở `chrome://extensions`.

## Cách hoạt động

- `src/background.ts`: đăng nhập, bắt đầu và dừng ghi, mở trang ghi.
- `src/offscreen.ts`: ghi tab Meet trộn với micro, lưu từng đoạn vào IndexedDB, upload khi dừng, tiếp tục các bản dang dở khi Chrome mở lại.
- `src/lib/upload.ts`: upload Drive kiểu resumable. Video đi thẳng từ trình duyệt lên Drive, không qua máy chủ.
- `src/popup.ts`, `popup.html`: giao diện.

Đăng nhập: `chrome.identity.launchWebAuthFlow` mở `api.englishmaile.com/extension/login`, chuyển sang Google, rồi về lại API. API chỉ cho email của giáo viên đang dạy vào và đưa cho extension một token riêng (30 ngày), kèm trong mọi lệnh gọi sau đó. Extension không cầm thông tin đăng nhập Drive nào: API tạo sẵn link upload.

API (`/extension/*`):

| Lệnh                                     | Việc                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /extension/login?redirect=`         | bắt đầu đăng nhập Google, cuối cùng redirect về extension với `#token=` hoặc `?error=` |
| `GET /extension/sessions?meetUrl=`       | lớp của link Meet và các buổi quanh hôm nay (`other: true` nếu không thuộc lớp nào)    |
| `POST /extension/uploads`                | tạo thư mục Drive và link upload cho bản ghi                                           |
| `POST /extension/sessions/{id}/complete` | đánh dấu buổi học đã ghi, kèm link Drive                                               |

## Phát triển

```bash
pnpm install
pnpm dev            # build lại khi sửa file
pnpm build          # ra dist/, nạp thư mục dist/ bằng Load unpacked
pnpm check          # định dạng + lint
pnpm exec tsc --noEmit
pnpm test           # unit test
pnpm e2e            # Chromium thật với API và Drive giả (cần: pnpm exec playwright install chromium)
```

Chưa có test tự động cho `tabCapture` (cần bấm biểu tượng thật) và cuộc gọi Meet thật. Xem `TESTING.md` để thử tay từng bước.

Muốn trỏ extension về API chạy local, trong console của service worker (`chrome://extensions` > Inspect views): `chrome.storage.local.set({apiBase: "http://localhost:8080"})`.

### Phát hành

Sửa xong, **tăng `version` ở cả `public/manifest.json` và `package.json`** rồi push lên `main`. `.github/workflows/release.yml` kiểm tra, build, nén `dist/` thành `meetle-recorder.zip` và tạo release `v<version>`. Link "Tải bản mới nhất" ở trên luôn trỏ tới bản đó. Version đã có release thì workflow bỏ qua, nên quên tăng version thì sẽ không ra bản mới.

ID của extension cố định nhờ trường `key` trong `manifest.json` (là public key), nên giống nhau trên mọi máy.
