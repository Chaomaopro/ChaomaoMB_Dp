-- Kiểm tra nhanh sau khi chạy schema.sql

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'user_data')
order by tablename;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'user_data')
order by tablename, policyname;

select count(*) as total_profiles from public.profiles;
select count(*) as total_user_data_rows from public.user_data;
