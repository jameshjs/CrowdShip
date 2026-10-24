# Event Task Board

A tiny task board used as the live demo app for CrowdShip. The audience suggests changes, votes, and a coding agent opens a draft PR here.

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run test:e2e   # browser tests (playwright)
```

- Required checks: `typecheck`, `unit`, `e2e` (see `.github/workflows/ci.yml`; no secrets).
- `crowdship-agent.yml` is dispatched by CrowdShip to run Claude Code on an approved task.
- All interactive elements have stable `data-testid` attributes; keep them.
- Known issue (intentional, for the bug-report demo): see `updateCounts` in `src/tasks.ts`.
