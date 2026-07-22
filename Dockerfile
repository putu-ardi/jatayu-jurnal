# syntax=docker/dockerfile:1.7

FROM node:24.16.0-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM dependencies AS builder
COPY . .
RUN npm run build && npm run worker:build

FROM base AS web
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /nonexistent --shell /usr/sbin/nologin nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER 1001:1001
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

FROM base AS worker
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /nonexistent --shell /usr/sbin/nologin worker
COPY --from=production-dependencies --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/dist-worker/index.cjs ./dist-worker/index.cjs
USER 1001:1001
HEALTHCHECK --interval=20s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const{statSync}=require('node:fs');try{if(Date.now()-statSync('/tmp/worker-ready').mtimeMs>45000)process.exit(1)}catch{process.exit(1)}"]
CMD ["node", "dist-worker/index.cjs"]

FROM dependencies AS migrate
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /nonexistent --shell /usr/sbin/nologin migrate
COPY --chown=migrate:nodejs prisma ./prisma
COPY --chown=migrate:nodejs prisma.config.ts ./prisma.config.ts
USER 1001:1001
CMD ["npm", "run", "db:deploy"]

FROM dependencies AS bootstrap
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /nonexistent --shell /usr/sbin/nologin bootstrap
COPY --chown=bootstrap:nodejs prisma ./prisma
COPY --chown=bootstrap:nodejs prisma.config.ts tsconfig.json ./
COPY --chown=bootstrap:nodejs scripts ./scripts
COPY --chown=bootstrap:nodejs src ./src
RUN npm run prisma:generate
USER 1001:1001
CMD ["npm", "run", "bootstrap:first-admin"]
