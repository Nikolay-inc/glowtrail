-- Glowtrail: облачные сохранения и удаление аккаунта.
-- Выполнить один раз в Supabase: Dashboard → SQL Editor → вставить файл целиком → Run.

-- Одна строка на игрока: профиль и прогресс (jsonb). Лог событий остаётся на устройстве.
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  version    integer not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  -- защита от раздувания: сохранение игры — это несколько килобайт
  constraint saves_data_size check (pg_column_size(data) < 64000)
);

-- Row Level Security: каждый видит и меняет только свою строку.
alter table public.saves enable row level security;

drop policy if exists "saves: read own" on public.saves;
create policy "saves: read own" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "saves: insert own" on public.saves;
create policy "saves: insert own" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "saves: update own" on public.saves;
create policy "saves: update own" on public.saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Удаление аккаунта самим игроком (требование App Store и Google Play).
-- Удаляет пользователя Auth; его сохранение удалится каскадом.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
