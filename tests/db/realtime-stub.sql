-- Minimal stand-ins for Supabase's realtime/auth schemas so the app migration
-- applies to a plain test database. realtime.send() records into a table
-- so tests can assert what would have been broadcast.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigserial primary key, topic text, extension text, event text, payload jsonb, private boolean, inserted_at timestamptz default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$ select ''::text $$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.messages (topic, extension, event, payload, private) values (topic, 'broadcast', event, payload, private) $$;
