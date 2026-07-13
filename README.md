# Chào Mào Chiến Suốt Pro v2.0 Cloud

PWA đa người dùng, có đăng ký/đăng nhập, đồng bộ dữ liệu qua Supabase và trang quản trị tài khoản cơ bản dành cho chủ hệ thống.

## Đã có trong bản này

- Đăng ký và đăng nhập bằng email/mật khẩu.
- Xác nhận email và quên mật khẩu qua Supabase Auth.
- Mỗi người dùng có vùng dữ liệu riêng, được bảo vệ bằng Row Level Security.
- Đồng bộ hồ sơ chim, lịch chăm, phong độ, sức khỏe, dinh dưỡng, tập luyện và phiên thi đấu.
- Lưu cục bộ để tiếp tục sử dụng khi mất mạng sau lần đăng nhập đầu.
- Tự chuyển dữ liệu từ PWA v1 đang lưu trên cùng trình duyệt lên tài khoản cloud.
- Tài khoản quản trị xem danh sách người dùng, khóa/mở và cấp gói Free/Pro/Owner.
- Cài lên màn hình chính iPhone/Android như ứng dụng.
- Triển khai miễn phí bằng GitHub Pages.

## Cấu trúc hệ thống

```text
Điện thoại/Trình duyệt
        │
        ├── GitHub Pages: giao diện PWA
        │
        └── Supabase
              ├── Auth: tài khoản đăng nhập
              ├── PostgreSQL: dữ liệu ứng dụng
              └── RLS: tách dữ liệu từng người dùng
```

## Bắt đầu nhanh

1. Chạy `supabase/schema.sql` trong Supabase SQL Editor.
2. Mở `supabase-config.js` và điền Project URL + Publishable key.
3. Tải toàn bộ thư mục lên một GitHub repository.
4. Bật GitHub Pages từ nhánh `main`, thư mục `/ (root)`.
5. Cấu hình Site URL và Redirect URLs trong Supabase Auth.
6. Đăng ký tài khoản đầu tiên.
7. Chạy `supabase/make-admin.sql` để cấp quyền quản trị cho tài khoản của anh.

Xem hướng dẫn đầy đủ tại `HUONG-DAN-TRIEN-KHAI.md`.

## Cảnh báo bảo mật

- Chỉ dán **Publishable key** hoặc **anon key cũ** vào `supabase-config.js`.
- Không bao giờ dán **Secret key**, **service_role key** hoặc mật khẩu database vào mã nguồn/web.
- Không tắt Row Level Security trên các bảng `profiles` và `user_data`.
- Đừng sửa chính sách RLS nếu chưa hiểu rõ tác động.

## Mô hình dữ liệu hiện tại

Bản v2.0 lưu dữ liệu nghiệp vụ của mỗi người dùng trong một hàng JSONB tại bảng `user_data`. Cách này phù hợp để chuyển nhanh bản PWA hiện tại thành ứng dụng cloud và phục vụ số lượng người dùng ban đầu.

Khi hệ thống cần thống kê sâu, lưu nhiều ảnh/video hoặc quy mô rất lớn, nên tách thành các bảng chuẩn hóa như `birds`, `tasks`, `health_logs`, `performances` và `tournament_sessions`.

## Chạy thử trên Windows

Bấm đúp `start-local.bat`, hoặc chạy:

```bat
python -m http.server 8080
```

Mở:

```text
http://localhost:8080
```

Supabase Auth cần thêm `http://localhost:8080/**` vào Redirect URLs nếu thử đăng ký/xác nhận email trên máy.

## Chức năng chưa có trong v2.0

- Lưu ảnh/video lên Supabase Storage.
- Push Notification khi app đã đóng hoàn toàn.
- Thanh toán tự động.
- Khóa tài khoản trực tiếp trong Supabase Auth; hiện tại là khóa truy cập ứng dụng theo trường `status`.
- Phân quyền nhân viên cùng quản lý một giàn chim.
- Phân tích AI và nhận diện hành vi từ video.
- Cập nhật triển khai PWA
