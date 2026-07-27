# syntax=docker/dockerfile:1
FROM node:22.22.1-alpine3.23@sha256:8094c002d08262dba12645a3b4a15cd6cd627d30bc782f53229a2ec13ee22a00 AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG APP_VERSION=0.0.0-dev
ARG GIT_COMMIT=unknown
ENV NUXT_PUBLIC_APP_VERSION=${APP_VERSION} \
    NUXT_PUBLIC_COMMIT_SHA=${GIT_COMMIT}
COPY . .
RUN pnpm build

FROM node:22.22.1-alpine3.23@sha256:8094c002d08262dba12645a3b4a15cd6cd627d30bc782f53229a2ec13ee22a00 AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production
# The runtime only needs the Node executable. Remove npm/corepack tooling and
# their package tree so build-time supply-chain dependencies cannot ship.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx
# Refresh the pinned Alpine base packages at image build time so the runtime
# does not ship a stale security database from the Node image publication.
RUN apk upgrade --no-cache
COPY --from=build --chown=node:node /app/.output/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "const p=Number(process.env.PORT||3000);if(!Number.isInteger(p)||p<1||p>65535)process.exit(1);fetch(`http://127.0.0.1:${p}/healthz`).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server/index.mjs"]
