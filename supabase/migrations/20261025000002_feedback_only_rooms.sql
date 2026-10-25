-- Feedback-only sessions: collect feedback and votes on any public website, with no
-- repository or coding agent. The round ends with published results instead of a build.
alter table rooms add column mode text not null default 'build' check (mode in ('build', 'feedback'));
alter table projects alter column github_repository drop not null;
