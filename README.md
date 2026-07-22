# affiliate-portal

Infrastructure-only Nuxt service scaffold. Product features are intentionally absent from this bootstrap.

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

The development server listens on `0.0.0.0:3000`. Operational probes are available at `/healthz` and `/readyz`.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm build` is the production build interface and should run in CI. See [docs/ci-deploy.md](docs/ci-deploy.md) for the CI and deployment contract.

## Branch flow

Create feature branches from `develop` and open pull requests back to `develop`. Promote validated changes from `develop` to `main` through review.
