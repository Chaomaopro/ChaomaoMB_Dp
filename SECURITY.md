# Bảo mật triển khai

## Được phép để trong frontend

- Supabase Project URL.
- Supabase Publishable key.
- Legacy anon key nếu dự án cũ chưa có Publishable key.

Các giá trị trên chỉ an toàn khi Row Level Security được bật và policy đúng.

## Tuyệt đối không đưa lên GitHub hoặc trình duyệt

- Supabase Secret key.
- service_role key.
- Database password/connection string.
- Mật khẩu email SMTP.
- Khóa riêng của dịch vụ thanh toán.

## Kiểm tra bắt buộc

- `profiles` bật RLS.
- `user_data` bật RLS.
- Người dùng A không đọc được hàng của người dùng B.
- Tài khoản thường không xem được danh sách tất cả profiles.
- Tài khoản thường không thể tự đổi role/plan/status.
