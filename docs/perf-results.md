# Measured performance

All numbers come from `scripts/load-test.ts` runs. Nothing here is estimated. Re-run with `pnpm load-test` (`N=150 pnpm load-test` for more participants).

## 2026-10-24 local run

**Environment:** MacBook Pro, `next dev` (unoptimized dev build), worker on the same machine, local Supabase in Docker. A production build on Vercel plus hosted Supabase will differ. Re-measure there before quoting numbers.

All participants submitted from one IP and acted at the same instant, which is the worst case for the API.

| Participants | Join p50 / p95 | Feedback p50 / p95 | Vote p50 / p95 | Vote throughput | Ballots in DB | Realtime delivery p50 / p95 (end-to-end) | Errors |
|---|---|---|---|---|---|---|---|
| 50  | 272 / 290 ms | 304 / 342 ms | 228 / 272 ms | 190 req/s | 50 / 50   | 339 / 340 ms (100 of 100 delivered) | 0 |
| 150 | 391 / 568 ms | 395 / 522 ms | 405 / 749 ms | 221 req/s | 150 / 150 | 333 / 400 ms (450 of 450 delivered) | 0 |

- The vote phase sends N first votes plus N/2 vote changes, all concurrently. After every run, "Ballots in DB" matched the participant count exactly.
- Realtime latency runs from the commit of the first change to receipt by the client. It includes the worker's 300 ms coalescing window.

### Finding: per-event broadcasts exceeded the Realtime quota

The first version broadcast every vote and every feedback item to every client. At 150 participants, the local Realtime server rejected the sends with `UnableToBroadcastChanges: :too_many_requests` and **zero** messages were delivered. Hosted Supabase enforces similar per-project message quotas.

**Fix:** transactions now append hints to an insert-only `realtime_outbox` table. The worker flushes at most one message per room and event type every 300 ms, recomputing vote tallies at send time. With that change, 150 of 150 subscribers received every update (see the table). Clients still reload canonical state on every hint and on reconnect.

### Finding: per-IP join limit would block a venue

The join endpoint was originally limited to 30 requests per minute per IP. At an event, most phones share the venue Wi-Fi's IP address, so the 31st person would have been refused. The per-IP limits on join and realtime tokens are now 400 and 1000 per minute. Abuse control for feedback and voting is applied per participant (10 and 20 per minute).

## Instrumented metrics

These are written to the `metrics` table and logged as structured JSON:

| Metric | Source |
|---|---|
| `join_latency`, `feedback_latency`, `vote_latency` | API route timing (server) |
| `time_to_join_client` | Page navigation start to join success (client) |
| `realtime_delivery` | Sampled on the client using clock offset from `/state` |
| `triage_latency` (labels: provider, items, fallback) | Worker |
| `agent_launch`, `time_to_pr`, `agent_session_duration` | Worker |
| `verification_duration`, `change_verified` (1 or 0, for pass rate) | Worker |

To summarize:

```sql
select name, count(*), percentile_cont(0.5) within group (order by value_ms) p50,
       percentile_cont(0.95) within group (order by value_ms) p95
from metrics where value_ms is not null group by name order by name;

select avg(value_num) as pass_rate from metrics where name = 'change_verified';
```
