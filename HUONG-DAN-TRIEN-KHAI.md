# HƯỚNG DẪN ĐƯA CHÀO MÀO CHIẾN SUỐT PRO LÊN GITHUB + SUPABASE

## Kết quả sau khi hoàn thành

Anh sẽ có một địa chỉ dạng:

```text
https://TEN-GITHUB.github.io/chao-mao-chien-suot-pro/
```

Người dùng có thể:

- Mở bằng Safari/Chrome.
- Đăng ký tài khoản riêng.
- Đăng nhập trên nhiều điện thoại.
- Xem đúng dữ liệu của tài khoản mình.
- Thêm biểu tượng ứng dụng ra màn hình chính.

Anh có tài khoản quản trị để xem danh sách người dùng, khóa/mở và cấp gói.

---

# PHẦN A — CHUẨN BỊ SUPABASE

## Bước 1. Mở dự án Supabase

Đăng nhập Supabase và chọn đúng dự án dùng cho Chào Mào Chiến Suốt Pro.

## Bước 2. Tạo bảng và chính sách bảo mật

1. Vào **SQL Editor**.
2. Chọn **New query**.
3. Mở file `supabase/schema.sql` trong bộ mã.
4. Sao chép toàn bộ nội dung.
5. Dán vào SQL Editor.
6. Nhấn **Run**.

Sau khi chạy thành công, kiểm tra **Table Editor** phải có:

```text
profiles
user_data
```

Không tắt RLS của hai bảng này.

## Bước 3. Lấy Project URL và Publishable key

Trong Supabase Dashboard, mở khu vực **Connect** hoặc **Project Settings → API Keys**.

Anh cần lấy đúng hai giá trị:

```text
Project URL: https://xxxxxxxx.supabase.co
Publishable key: sb_publishable_...
```

Dự án cũ có thể hiển thị `anon key`. Có thể dùng anon key, nhưng ưu tiên Publishable key.

Tuyệt đối không dùng:

```text
sb_secret_...
service_role
Database password
```

## Bước 4. Điền cấu hình vào ứng dụng

Mở file:

```text
supabase-config.js
```

Thay:

```javascript
window.CMCS_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseKey: 'sb_publishable_REPLACE_ME'
};
```

thành thông tin thật, ví dụ:

```javascript
window.CMCS_CONFIG = {
  supabaseUrl: 'https://abcdefghijk.supabase.co',
  supabaseKey: 'sb_publishable_xxxxxxxxxxxxxxxxx'
};
```

Chỉ sửa nội dung nằm giữa dấu nháy đơn.

---

# PHẦN B — TẠO ĐỊA CHỈ GITHUB PAGES

## Bước 5. Tạo repository trên GitHub

1. Đăng nhập GitHub.
2. Chọn **New repository**.
3. Đặt tên:

```text
chao-mao-chien-suot-pro
```

4. Có thể chọn Public để dùng GitHub Pages đơn giản.
5. Nhấn **Create repository**.

## Bước 6. Tải mã nguồn lên GitHub

Trong repository vừa tạo:

1. Chọn **Add file → Upload files**.
2. Mở thư mục `Chao-Mao-Chien-Suot-Pro-v2-Cloud` trên máy.
3. Chọn toàn bộ file và thư mục bên trong, không tải nguyên file ZIP.
4. Kéo vào trang GitHub.
5. Nhấn **Commit changes**.

Ở cấp cao nhất của repository phải nhìn thấy:

```text
index.html
app.js
cloud.js
styles.css
supabase-config.js
manifest.webmanifest
sw.js
assets/
supabase/
```

## Bước 7. Bật GitHub Pages

1. Trong repository, vào **Settings**.
2. Chọn **Pages** ở thanh bên trái.
3. Tại **Build and deployment**, chọn:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

4. Nhấn **Save**.
5. Đợi GitHub hiển thị địa chỉ website.

Địa chỉ thường có dạng:

```text
https://TEN-GITHUB.github.io/chao-mao-chien-suot-pro/
```

---

# PHẦN C — CẤU HÌNH ĐĂNG NHẬP

## Bước 8. Khai báo địa chỉ website trong Supabase

Quay lại Supabase:

1. Vào **Authentication**.
2. Mở **URL Configuration**.
3. Tại **Site URL**, nhập địa chỉ GitHub Pages của app:

```text
https://TEN-GITHUB.github.io/chao-mao-chien-suot-pro/
```

4. Tại **Redirect URLs**, thêm:

```text
https://TEN-GITHUB.github.io/chao-mao-chien-suot-pro/**
```

Nếu chạy thử trên máy, thêm:

```text
http://localhost:8080/**
```

5. Lưu cấu hình.

## Bước 9. Kiểm tra Email Provider

Trong **Authentication → Providers**, bảo đảm Email đang được bật.

Có hai chế độ:

- **Confirm email bật:** người dùng phải mở thư xác nhận.
- **Confirm email tắt:** đăng ký xong có thể vào ngay.

Khi chạy thật cho nhiều người, nên bật xác nhận email.

---

# PHẦN D — TẠO TÀI KHOẢN QUẢN TRỊ

## Bước 10. Đăng ký tài khoản đầu tiên

1. Mở địa chỉ GitHub Pages.
2. Chọn **Tạo tài khoản**.
3. Nhập tên, email, mật khẩu.
4. Xác nhận email nếu hệ thống yêu cầu.
5. Đăng nhập ít nhất một lần.

## Bước 11. Cấp quyền quản trị

1. Mở file `supabase/make-admin.sql`.
2. Thay `EMAIL_CUA_ANH@gmail.com` bằng email vừa đăng ký.
3. Sao chép nội dung vào Supabase SQL Editor.
4. Nhấn **Run**.
5. Đăng xuất rồi đăng nhập lại ứng dụng.

Trong mục **Thêm**, anh sẽ thấy:

```text
★ Chủ hệ thống — Quản trị người dùng
```

## Các quyền quản trị hiện có

- Xem tổng số tài khoản.
- Xem tài khoản đang hoạt động.
- Xem lần hoạt động gần nhất.
- Khóa/mở quyền truy cập app.
- Chuyển gói Free, Pro, Owner.
- Đặt ngày hết hạn gói.

Lưu ý: nút Khóa hiện ngăn tài khoản truy cập ứng dụng sau lần đăng nhập/tải lại tiếp theo. Nó không xóa tài khoản khỏi Supabase Auth.

---

# PHẦN E — KIỂM TRA ĐA NGƯỜI DÙNG

## Bước 12. Thử bằng hai tài khoản

Tạo hai tài khoản khác nhau:

```text
Tài khoản A
Tài khoản B
```

Thử nghiệm:

1. Tài khoản A thêm một chú chim.
2. Đăng xuất.
3. Tài khoản B đăng nhập.
4. Tài khoản B không được nhìn thấy chim của A.
5. Tài khoản B thêm dữ liệu riêng.
6. Đăng nhập A trên điện thoại khác; dữ liệu A phải xuất hiện.

Nếu B nhìn thấy dữ liệu A, ngừng sử dụng và kiểm tra lại `schema.sql`/RLS ngay.

## Kiểm tra đồng bộ

Sau khi thêm dữ liệu, dòng dưới tiêu đề phải chuyển qua:

```text
Đang đồng bộ…
Đã đồng bộ
```

Mở Supabase **Table Editor → user_data** để xác nhận mỗi tài khoản có một hàng riêng.

---

# PHẦN F — CÀI LÊN ĐIỆN THOẠI

## iPhone

1. Mở link bằng Safari.
2. Nhấn Chia sẻ.
3. Chọn **Thêm vào Màn hình chính**.
4. Nhấn **Thêm**.

## Android

1. Mở link bằng Chrome.
2. Nhấn menu ba chấm.
3. Chọn **Cài đặt ứng dụng** hoặc **Thêm vào màn hình chính**.

---

# PHẦN G — CẬP NHẬT ỨNG DỤNG SAU NÀY

Khi có phiên bản mới:

1. Thay các file mới trong repository GitHub.
2. Commit changes.
3. GitHub Pages tự triển khai lại.
4. Tăng tên cache trong `sw.js`, ví dụ:

```javascript
const CACHE_NAME = 'cmcs-pro-v2.0.1';
```

Việc tăng cache giúp điện thoại nhận đúng mã mới thay vì tiếp tục dùng bản cũ.

---

# XỬ LÝ LỖI THƯỜNG GẶP

## App báo “Chưa kết nối dự án cloud”

- Chưa sửa `supabase-config.js`.
- Dán sai Project URL.
- Dán sai Publishable key.
- GitHub chưa nhận file cấu hình mới.

## Đăng ký xong nhưng không đăng nhập được

- Kiểm tra email xác nhận.
- Kiểm tra Email Provider.
- Kiểm tra Site URL và Redirect URLs.

## Đăng nhập được nhưng không thấy/lưu dữ liệu

- Chưa chạy `schema.sql`.
- RLS policy chưa tạo đủ.
- Bảng không được cấp quyền cho role `authenticated`.
- Mở Console trình duyệt để xem lỗi cụ thể.

## App vẫn hiện phiên bản cũ

- Tăng `CACHE_NAME` trong `sw.js`.
- Xóa app khỏi màn hình chính rồi cài lại.
- Trên iPhone, xóa dữ liệu website của địa chỉ app nếu cần.

## Không thấy mục quản trị

- Tài khoản chưa được đổi `role = admin`.
- Chạy lại `make-admin.sql` với đúng email.
- Đăng xuất và đăng nhập lại.
