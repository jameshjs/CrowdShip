# Long-lived CrowdShip worker (Railway / Fly / any container host). Build from the repo root:
#   docker build -f apps/worker/Dockerfile -t crowdship-worker .
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @crowdship/worker...
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@crowdship/worker", "exec", "tsx", "src/index.ts"]
