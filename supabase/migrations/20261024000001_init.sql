-- CrowdShip core schema.
-- All application access goes through the server (service role / direct Postgres).
-- RLS is enabled on every table with no anon/authenticated policies, so the
-- public Supabase API cannot read or write application data directly.
-- Clients only receive data through server routes and server-sent Realtime broadcasts.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type room_status as enum ('active', 'closed');
create type feedback_type as enum ('bug', 'feature', 'general', 'praise', 'confusing');
create type moderation_status as enum ('visible', 'held', 'hidden');
create type proposal_status as enum (
  'suggested',     -- produced by triage, awaiting organizer
  'approved',      -- eligible for voting
  'rejected',
  'selected',      -- won a round, awaiting dev approval
  'developing',
  'verifying',
  'review_ready',
  'completed',
  'failed',
  'archived'
);
create type complexity as enum ('small', 'medium', 'large', 'unknown');
create type round_status as enum (
  'collecting', 'triaging', 'voting', 'selected', 'developing',
  'verifying', 'review_ready', 'completed', 'failed', 'cancelled'
);
create type agent_provider as enum ('mock', 'devin', 'claude_code_action');
create type agent_state as enum (
  'queued',        -- job enqueued, not launched
  'launching',     -- create call in flight (uncertain outcome if crash here)
  'running',
  'pr_opened',
  'finished',      -- provider reports done
  'failed',
  'cancelled',
  'needs_reconcile'
);
create type check_status as enum ('pending', 'pass', 'fail', 'unavailable');
create type preview_rating as enum ('yes', 'no', 'needs_improvement');
create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

-- ---------------------------------------------------------------- projects / rooms
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  github_repository text not null check (github_repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  production_url text,
  organizer_id text not null,
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4,8}$'),
  status room_status not null default 'active',
  agent_provider agent_provider not null,
  max_acu_per_session int not null default 10 check (max_acu_per_session between 1 and 100),
  max_sessions_total int not null default 3 check (max_sessions_total between 0 and 50),
  agent_paused boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- participants
create table participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 32),
  guest_session_id uuid not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, guest_session_id)
);
create index participants_room_idx on participants(room_id);

-- ---------------------------------------------------------------- feedback
create table feedback (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  type feedback_type not null,
  text text not null default '' check (char_length(text) <= 1000),
  screenshot_path text,
  page_url text check (char_length(page_url) <= 300),
  element_identifier text check (char_length(element_identifier) <= 200),
  element_label text check (char_length(element_label) <= 200),
  application_version text check (char_length(application_version) <= 40),
  device_category text check (device_category in ('mobile', 'tablet', 'desktop', 'unknown')),
  browser text check (char_length(browser) <= 60),
  moderation moderation_status not null default 'visible',
  triaged_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_room_idx on feedback(room_id, created_at desc);
create index feedback_untriaged_idx on feedback(room_id) where triaged_at is null;

-- ---------------------------------------------------------------- proposals
create table proposals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default 'feature',
  requirements_json jsonb not null default '[]'::jsonb,
  acceptance_criteria_json jsonb not null default '[]'::jsonb,
  missing_details_json jsonb not null default '[]'::jsonb,
  status proposal_status not null default 'suggested',
  complexity complexity not null default 'unknown',
  needs_review boolean not null default false,
  source text not null default 'triage' check (source in ('triage', 'organizer', 'seed')),
  normalized_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proposals_room_idx on proposals(room_id, status);

create table proposal_feedback (
  proposal_id uuid not null references proposals(id) on delete cascade,
  feedback_id uuid not null references feedback(id) on delete cascade,
  confidence real not null default 1,
  primary key (proposal_id, feedback_id)
);
-- A feedback item belongs to at most one proposal.
create unique index proposal_feedback_one_owner on proposal_feedback(feedback_id);

-- ---------------------------------------------------------------- voting
create table voting_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  number int not null,
  status round_status not null default 'collecting',
  started_at timestamptz,
  ends_at timestamptz,
  closed_at timestamptz,
  winning_proposal_id uuid references proposals(id),
  created_at timestamptz not null default now(),
  unique (room_id, number)
);
-- At most one non-terminal round per room.
create unique index voting_rounds_one_open on voting_rounds(room_id)
  where status not in ('completed', 'failed', 'cancelled');

create table round_proposals (
  round_id uuid not null references voting_rounds(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  primary key (round_id, proposal_id)
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references voting_rounds(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One active ballot per participant per round. Changing a vote updates this row.
  unique (round_id, participant_id),
  foreign key (round_id, proposal_id) references round_proposals(round_id, proposal_id)
);
create index votes_round_proposal_idx on votes(round_id, proposal_id);

-- ---------------------------------------------------------------- agents
create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  round_id uuid references voting_rounds(id) on delete set null,
  room_id uuid not null references rooms(id) on delete cascade,
  provider agent_provider not null,
  provider_session_id text,
  provider_url text,
  idempotency_tag text not null unique,
  state agent_state not null default 'queued',
  status_detail text,
  error text,
  github_issue_number int,
  github_issue_url text,
  pr_number int,
  pr_url text,
  pr_head_sha text,
  preview_url text,
  preview_released boolean not null default false,
  task_prompt text,
  launched_at timestamptz,
  pr_opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Only one agent session per proposal that isn't terminal-failed/cancelled.
create unique index agent_sessions_one_per_proposal on agent_sessions(proposal_id)
  where state not in ('failed', 'cancelled');

create table verification_results (
  id uuid primary key default gen_random_uuid(),
  agent_session_id uuid not null references agent_sessions(id) on delete cascade,
  commit_sha text not null,
  test_status check_status not null default 'pending',
  ci_status check_status not null default 'pending',
  checks_json jsonb not null default '[]'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_session_id, commit_sha)
);

create table preview_reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  agent_session_id uuid references agent_sessions(id) on delete set null,
  participant_id uuid not null references participants(id) on delete cascade,
  rating preview_rating not null,
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (proposal_id, participant_id)
);

-- ---------------------------------------------------------------- activity / audit
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  event_type text not null,
  public_payload jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index activity_events_room_idx on activity_events(room_id, created_at desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete set null,
  actor text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- jobs (worker queue)
create table jobs (
  id uuid primary key default gen_random_uuid(),
  queue text not null check (queue in ('feedback-triage', 'coding-agent', 'session-monitor', 'verification', 'round-timer')),
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
  idempotency_key text unique,
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready_idx on jobs(queue, run_at) where status = 'queued';

create table worker_controls (
  queue text primary key,
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into worker_controls(queue) values
  ('feedback-triage'), ('coding-agent'), ('session-monitor'), ('verification'), ('round-timer');

-- ---------------------------------------------------------------- rate limiting / metrics
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table metrics (
  id bigserial primary key,
  room_id uuid references rooms(id) on delete cascade,
  name text not null,
  value_ms double precision,
  value_num double precision,
  labels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index metrics_name_idx on metrics(name, created_at desc);

-- ---------------------------------------------------------------- RLS: deny-all for API roles
do $$
declare t text;
begin
  foreach t in array array[
    'projects','rooms','participants','feedback','proposals','proposal_feedback',
    'voting_rounds','round_proposals','votes','agent_sessions','verification_results',
    'preview_reviews','activity_events','audit_log','jobs','worker_controls','rate_limits','metrics'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Realtime authorization
-- Topics are "room:<CODE>". Guests receive a server-minted JWT with a room_code claim.
-- They may receive broadcasts and use presence on their own room topic only.
-- Only the server (service role, bypasses RLS) or realtime.send() may broadcast.
create policy "room members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() = 'room:' || (auth.jwt() ->> 'room_code')
    and realtime.messages.extension in ('broadcast', 'presence')
  );

create policy "room members track presence" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() = 'room:' || (auth.jwt() ->> 'room_code')
    and realtime.messages.extension = 'presence'
    and (auth.jwt() ->> 'cs_role') = 'participant'
  );
