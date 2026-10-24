-- Broadcast outbox. State-changing transactions append a hint here (insert-only,
-- no contention); the worker coalesces and sends at most one realtime message per
-- room/event every few hundred ms. Keeps fan-out under Realtime's message quotas.
create table realtime_outbox (
  id bigserial primary key,
  topic text not null,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table realtime_outbox enable row level security;
