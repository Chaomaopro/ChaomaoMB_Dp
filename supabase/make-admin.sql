-- BƯỚC NÀY CHỈ CHẠY SAU KHI ANH ĐÃ ĐĂNG KÝ TÀI KHOẢN TRONG APP.
-- Thay email bên dưới bằng email tài khoản quản trị của anh.

update public.profiles
set role = 'admin',
    plan = 'owner',
    status = 'active',
    plan_expires_at = null
where lower(email) = lower('EMAIL_CUA_ANH@gmail.com');

-- Kiểm tra kết quả:
select id, email, full_name, role, status, plan
from public.profiles
where lower(email) = lower('EMAIL_CUA_ANH@gmail.com');
