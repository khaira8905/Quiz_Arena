# QuizArena game server image (Railway / Render / Fly.io).
# Build from the REPOSITORY ROOT so the shared workspace package is available:
#   docker build -f apps/server/Dockerfile -t quizarena-server .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Prisma's migration engine needs OpenSSL; the slim image doesn't ship it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build

# Install dependencies first (cached unless manifests change).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
COPY apps/server/prisma apps/server/prisma
RUN pnpm install --frozen-lockfile --filter @quizarena/server...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @quizarena/server build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 4000
# Apply pending migrations, then start. Migrations are idempotent and safe on every boot.
CMD ["sh", "-c", "cd apps/server && pnpm exec prisma migrate deploy && node dist/index.js"]
