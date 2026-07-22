# syntax=docker/dockerfile:1
FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG APP_VERSION=0.0.0-dev
ARG GIT_COMMIT=unknown
ENV NUXT_PUBLIC_APP_VERSION=${APP_VERSION} \
    NUXT_PUBLIC_COMMIT_SHA=${GIT_COMMIT}
COPY . .
RUN pnpm build

FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production
COPY --from=build --chown=node:node /app/.output/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server/index.mjs"]
