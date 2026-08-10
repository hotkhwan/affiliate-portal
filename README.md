# KWANNI Portal

KWANNI is a guided affiliate starter for beginners. This repository contains the Nuxt client for the Mission Zero First Post loop: enter verified product facts, attach one exact product image, let Qwen create a three-shot CPS, queue one free five-second Wan2.2 preview on the local DGX, leave and return at the displayed ETA, review advisory ShotVL feedback, download the MP4, post manually, and record the outcome. Paid Veo/Seedance generation is not exposed by the Alpha UI.

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

The development server listens on `0.0.0.0:3000`. Operational probes are available at `/healthz` and `/readyz`. `NUXT_APP_BASE_URL` defaults to `/dev/llm-portal/`, while `NUXT_PUBLIC_MISSION_API_BASE` defaults to `/dev/llm-api/v1`; override both when running at another path. Set `NUXT_DEV_ALLOWED_HOSTS` to the comma-separated Gateway host names used for this Development site. The list is explicit and never disables Vite's DNS-rebinding protection. Normal requests use a 30-second deadline. Draft and export use the separately configurable 120-second deadline until those operations move fully behind asynchronous jobs.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm build` is the production build interface and must run in CI. See [CI and deployment](docs/ci-deploy.md).

## Branch flow

Create feature branches from `develop` and open pull requests back to `develop`. Promote validated changes from `develop` to `main` through review.
