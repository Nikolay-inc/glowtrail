-- Glowtrail: права на таблицу сохранений для вошедших игроков.
-- В новых проектах Supabase таблицы не открываются для API автоматически,
-- поэтому даём роли authenticated доступ явно. Какие строки ей видны — решают политики RLS из 001_init.sql
-- (только своя строка). Гостям (anon) доступа нет.
-- Выполнить один раз: Dashboard → SQL Editor → вставить → Run.

grant usage on schema public to authenticated;
grant select, insert, update on table public.saves to authenticated;
