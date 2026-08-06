# KWANNI Portal

KWANNI is a guided affiliate starter for beginners. This repository contains the Nuxt client for the smallest Mission Zero loop: enter real product facts, follow a three-shot guide, prepare a caption and export plan, post manually, and record the first post.

The Alpha intentionally does not include trend aggregation, automatic publishing, credits, a marketplace, or income promises. See [Mission Zero Alpha](docs/mission-zero-alpha.md) for the product and integration boundary.

## Requirements

- Node.js 22.18.0 or newer within the 22.x release line
- Corepack

## Local development

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The development server listens on `0.0.0.0:3000`. Operational probes are available at `/healthz` and `/readyz`. `NUXT_PUBLIC_MISSION_API_BASE` defaults to the same-origin `/v1` API contract.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm build` is the production build interface and must run in CI. See [CI and deployment](docs/ci-deploy.md).

## Branch flow

Create feature branches from `develop` and open pull requests back to `develop`. Promote validated changes from `develop` to `main` through review.
