-- Swipe deck: during the ideas phase each participant swipes 👍/👎 on approved proposals.
-- Approval (likes / swipes) shortlists the final 1-tap vote. One swipe per person per idea per round.
create table swipes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references voting_rounds(id) on delete cascade,
  proposal_id uuid not null references proposals(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, proposal_id, participant_id)
);
create index swipes_round_idx on swipes(round_id, proposal_id);
alter table swipes enable row level security;
