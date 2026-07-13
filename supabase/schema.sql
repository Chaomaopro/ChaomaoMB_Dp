-- ================================================================
-- CHÀO MÀO CHIẾN SUỐT PRO v2 CLOUD
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor.
-- Có thể chạy lại an toàn trên dự án đã cài bản schema này.
-- ================================================================

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default 'Nghệ nhân',
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'locked', 'inactive')),
  plan text not null default 'free' check (plan in ('free', 'pro', 'owner')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{
    "profile": {"owner":"Nghệ nhân","phone":"","version":"2.0.0","notificationsEnabled":false,"notifiedTaskKeys":[]},
    "birds":[],"tasks":[],"performances":[],"healthLogs":[],
    "nutritionLogs":[],"trainingLogs":[],"tournamentSessions":[]
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
before update on public.user_data
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Nghệ nhân')
  )
  on conflict (id) do nothing;

  insert into public.user_data (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Bổ sung hồ sơ cho các tài khoản đã tồn tại trước khi chạy schema.
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), 'Nghệ nhân')
from auth.users u
on conflict (id) do nothing;

insert into public.user_data (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.update_my_profile(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set full_name = left(coalesce(nullif(trim(p_full_name), ''), 'Nghệ nhân'), 120)
  where id = auth.uid();
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

-- Xóa chính sách cũ nếu chạy lại file.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_admin_select_all on public.profiles;
drop policy if exists profiles_admin_update_all on public.profiles;
drop policy if exists user_data_select_own on public.user_data;
drop policy if exists user_data_insert_own on public.user_data;
drop policy if exists user_data_update_own on public.user_data;
drop policy if exists user_data_delete_own on public.user_data;
drop policy if exists user_data_admin_select on public.user_data;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_admin_select_all
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy profiles_admin_update_all
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy user_data_select_own
on public.user_data
for select
to authenticated
using (user_id = auth.uid());

create policy user_data_insert_own
on public.user_data
for insert
to authenticated
with check (user_id = auth.uid());

create policy user_data_update_own
on public.user_data
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_data_delete_own
on public.user_data
for delete
to authenticated
using (user_id = auth.uid());

-- Chỉ cấp đúng quyền cần thiết cho API.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_data from anon, authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.touch_last_seen() from public, anon, authenticated;
revoke all on function public.update_my_profile(text) from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_data to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.update_my_profile(text) to authenticated;

commit;
