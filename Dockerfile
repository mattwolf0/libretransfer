FROM node:24.18-alpine AS build

WORKDIR /build
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY apps/web apps/web
COPY .prettierrc.json ./
RUN pnpm build \
    && pnpm --filter @libretransfer/api --prod deploy /production

FROM node:24.18-alpine

ENV NODE_ENV=production \
    LIBRETRANSFER_HOST=0.0.0.0 \
    LIBRETRANSFER_DATABASE_PATH=/app/data/libretransfer.db \
    LIBRETRANSFER_CONFIG_PATH=/app/config.json \
    LIBRETRANSFER_WEB_PATH=/app/apps/web/dist

WORKDIR /app
COPY --from=build --chown=node:node /production ./
COPY --from=build --chown=node:node /build/apps/web/dist apps/web/dist
RUN mkdir -p /app/data /app/share && chown -R node:node /app/data /app/share

USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:8000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/cli.js", "app", "start"]
