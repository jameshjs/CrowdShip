# CrowdShip

The audience suggests improvements to an app, AI groups the suggestions into proposals, everyone votes, and a coding agent (Devin, Claude Code, or a labeled mock) opens a draft PR. Independent CI then verifies the PR, and the crowd tries the preview and rates it. A human approves every step that matters.

```
feedback ─▶ AI triage ─▶ organizer approves ─▶ community vote ─▶ organizer approves winner
   ─▶ GitHub issue ─▶ coding agent ─▶ draft PR (approved repo only) ─▶ required checks on head SHA
   ─▶ REVIEW_READY ─▶ organizer releases preview ─▶ A/B try + rating ─▶ organizer closes round
```

## Quick start (local, mock mode, no external keys)

Requirements: Node 22+, pnpm 10, Docker.

```bash
pnpm install
pnpm db:start                       # local Supabase (Postgres + Realtime) in Docker; applies migrations
cp .env.example .env                # fill in ANON key + JWT secret printed by db:start
pnpm dev                            # web on http://localhost:3000
pnpm worker                         # in a second terminal: jobs, agent monitor, CI verification, realtime flusher
pnpm seed --backup                  # creates a demo room + a completed backup round; prints URLs
```

Open `/admin` (password: `ORGANIZER_PASSWORD`), then put the room's `/room/<code>/live` page on the projector. Phones scan the QR code.

To run the demo task board locally: `cd apps/demo-app && npm ci && VITE_CROWDSHIP_URL=http://localhost:3000 npm run dev` (port 5173).

## Layout

```
apps/web               Next.js App Router: participant PWA-style UI, live dashboard, organizer console, API routes
apps/worker            Long-lived Node worker: Postgres job queue, agent launch/monitor, CI verification, realtime flusher
apps/demo-app          The app under test (Vite + React). Pushed to its own GitHub repo; has CI + agent workflows
packages/shared        Domain types, Zod schemas, round state machine, moderation
packages/db            SQL (postgres.js) services: rooms, feedback, proposals, voting, agents, verification, jobs
packages/ai            Triage: Claude (default) / OpenAI structured output, deterministic fallback clustering
packages/integrations  CodingAgentProvider: DevinProvider (API v3), ClaudeCodeActionProvider, MockCodingAgentProvider; GitHub (Octokit)
packages/feedback-widget  Embeddable widget (vanilla TS, Shadow DOM): bug / idea / select-an-element
supabase/migrations    Schema, constraints, RLS, Realtime authorization
tests/                 Vitest unit + integration (isolated DB), Playwright e2e
scripts/               seed (demo setup), load-test
```

### Design decisions

- **Queue:** a Postgres `jobs` table (`FOR UPDATE SKIP LOCKED`) instead of Redis/BullMQ. It has retries with exponential backoff, idempotency keys, dead-letter inspection, per-queue pause and resume, and stale-job recovery after a crash, with one less service to run.
- **Organizer auth:** one `ORGANIZER_PASSWORD` gives a signed HttpOnly cookie behind `requireOrganizer()`. Clerk can replace it behind that single seam.
- **Guests:** a signed HttpOnly `SameSite=Lax` cookie holds a random guest id. The participant row is unique per (room, guest id). Mutations check `Origin` (CSRF).
- **Realtime:** the server mints room-scoped Supabase JWTs. Private channels are authorized by RLS on `realtime.messages`: participants can listen and track presence, dashboard viewers can only listen, and only the server broadcasts. Broadcasts are coalesced hints, and clients always refetch canonical state (see `docs/perf-results.md` for why).
- **Database:** Postgres is the source of truth. RLS is on for every table with no API-role policies, so all data access goes through server routes.

## Coding agents

Each room picks one provider when it's created, and it never changes. A misconfigured real provider fails loudly; it is **never** silently replaced by mock.

| Provider | What runs | Needs |
|---|---|---|
| `mock` | Simulated steps with a "Demo mode" badge everywhere. With `MOCK_PR_URL` set, it uses a real pre-built PR and real CI; otherwise the PR and checks are simulated and labeled so | nothing |
| `devin` | `POST /v3/organizations/{org}/sessions` with `repos`, `tags` (idempotency tag), `max_acu_limit`; polls `GET …/sessions/{id}`; reconciles by `GET …/sessions?tags=` | `DEVIN_API_KEY` (service user, `cog_…`, `UseDevinSessions`), `DEVIN_ORG_ID`, Devin's GitHub integration on the demo repo |
| `claude_code_action` | Dispatches `crowdship-agent.yml` in the demo repo, which runs `anthropics/claude-code-action@v1`. The workflow, not the agent, commits and opens the draft PR, and reverts any `.github/` changes | `GITHUB_TOKEN` (Actions: write), repo secret `ANTHROPIC_API_KEY`, "Allow GitHub Actions to create pull requests" turned on |

The launch is idempotent: `queued → launching (CAS) → running`. If a create call has an uncertain outcome (timeout or 5xx), the session goes to `needs_reconcile`, and the provider is searched by tag before create is ever called again. Agent text from the audience is fenced as untrusted data inside a fixed instruction template (`packages/integrations/src/task-prompt.ts`).

### Verification

A PR counts only if it is in the approved repository. CrowdShip tracks the PR's current head SHA, and **REVIEW_READY requires `typecheck`, `unit` and `e2e` all passing on that SHA**. A new push resets verification. Checks that never report become `unavailable` after 20 minutes, and `unavailable` never counts as passing. The preview can be released only after verification. Nothing is ever merged or deployed to production automatically. PRs opened with the Actions `GITHUB_TOKEN` don't trigger `pull_request` workflows, so CrowdShip dispatches `ci.yml` on the PR branch when no checks appear. The CI workflow uses no secrets.

## Environment

See `.env.example`. The web app runs on Vercel (root `apps/web`). The worker runs anywhere long-lived: `apps/worker/Dockerfile`, with `railway.json` for Railway, or `pnpm worker` on a laptop. Webhook: `POST /api/webhooks/github` (HMAC-verified with `GITHUB_WEBHOOK_SECRET`; it only nudges a re-poll).

For hosted Supabase, `SUPABASE_JWT_SECRET` is the project's JWT secret (legacy HS256 secret), used to mint guest Realtime tokens.

## Tests

```bash
pnpm test        # Vitest: unit + integration against an isolated crowdship_test DB (recreated each run)
pnpm test:e2e    # Playwright (mobile viewport) against the running dev stack (pnpm dev + pnpm worker)
pnpm load-test   # 50 concurrent participants (N=150 for more); prints measured latencies
```

How the spec's test scenarios map to the tests:

| # | Scenario | Where |
|---|---|---|
| 1, 2 | Join via QR URL; identity persists across refresh | `e2e/participant.spec.ts` |
| 3, 4 | Feedback in two taps; other participants and dashboard see it live | `e2e/participant.spec.ts` |
| 5, 6 | Similar suggestions cluster; uncertain matches flagged; organizer split, move, merge | `unit/triage.test.ts`; admin UI |
| 7–10 | Cast and change a vote; 20 concurrent duplicates make one ballot; 40 concurrent voters exact; DB unique constraint; late votes rejected | `integration/voting.test.ts`, `e2e/participant.spec.ts` |
| 11 | Participant cannot launch an agent or perform organizer actions (401); cross-site POST blocked (403) | `e2e/participant.spec.ts` |
| 12 | 8 concurrent approvals produce one session and one job | `integration/agent-flow.test.ts` |
| 13 | Failed agent never shows as completed | `integration/agent-flow.test.ts` |
| 14 | Failing PR not verified; preview can't be released; new SHA resets verification | `integration/agent-flow.test.ts` |
| 15 | Preview ratings attributed to the proposal; need a released preview | `integration/agent-flow.test.ts` |
| 16 | Full flow in labeled mock mode, through the UI | `e2e/full-flow.spec.ts`, `integration/agent-flow.test.ts` |

## Security notes

- Organizer authorization is checked server-side on every admin route and action. Every organizer action is written to `audit_log`.
- Zod validates all input. All user text renders as plain text; nothing from users reaches `dangerouslySetInnerHTML`.
- Public feedback passes a simple profanity and link filter. Flagged items are held for the organizer, who can hide anything, and hiding removes it from the projected feed live.
- Agent credentials and GitHub tokens stay in server and worker env only. Public events carry no secrets, guest ids or prompts, and agent errors are scrubbed of token-like strings.
- Rate limits: per participant for feedback (10/min), votes (20/min) and ratings (10/min). The per-IP limits on join and realtime tokens are high because venue Wi-Fi shares one IP.
- The widget token is short-lived (12h), passed in the URL fragment, moved to `sessionStorage`, and stripped from the URL right away. Recorded page URLs keep only the path.

**One person, one vote is not guaranteed.** Guest sessions stop casual repeat voting (refreshing or double-tapping), but someone who clears cookies or uses another browser can vote again. Each ballot is unique per guest session, which is the right trade-off for a no-signup live event, not for binding decisions.

## Status

| Area | State |
|---|---|
| Mobile join, feedback, voting, live dashboard, organizer console | Working, covered by e2e |
| AI triage | Deterministic fallback tested. Claude and OpenAI paths are implemented with Zod structured output; **not yet run against the live API** (no key in this environment) |
| Mock agent flow end to end | Working, covered by e2e and integration tests |
| Devin provider | Implemented against the v3 OpenAPI spec (2026-10-24); **untested against the live API: no Devin credentials yet** |
| Claude Code Action provider | Implemented; **untested until the demo repo, PAT and repo secret exist** |
| GitHub issue, PR discovery, check verification | Logic tested with a fake GitHub client; **live GitHub untested until the demo repo exists** |
| Load (50 / 150 participants) | Measured locally, 0 errors; see `docs/perf-results.md` |
| Cut for v1 (agreed) | PWA install, voice input, screenshot upload and annotation, Clerk |
