# CI and deployment interface

This document defines the repository side of the D3 CI/deployment boundary. It deliberately does not assume credential identifiers, registry locations, clusters, namespaces, or a particular CI controller configuration.

## CI inputs

- A clean checkout at an immutable Git commit.
- Node.js 22 and Corepack, or a container builder capable of the checked-in `Dockerfile`.
- `APP_VERSION`, taken from `package.json`.
- `GIT_COMMIT`, set to the full checked-out commit SHA.
- Registry and deployment credentials supplied by the external CI platform. They must never be written into this repository or image layers.

## Required validation

CI must run these commands before publishing an image:

```sh
corepack enable
corepack prepare pnpm@11.15.1 --activate
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

The container build must pass both version values without exposing secrets:

```sh
docker build \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg GIT_COMMIT="$GIT_COMMIT" \
  --tag "$IMAGE_REF" .
```

## Published artifact

- One OCI image built from the checked-in, digest-pinned multi-stage `Dockerfile`.
- The immutable image reference and source commit SHA recorded by CI.
- No `.env` file or secret included in the build context, image metadata, or layers.

## Runtime contract

- Listen on `0.0.0.0:3000` by default; `HOST` and `PORT` may be overridden.
- Run as the image's non-root `node` user.
- `GET /healthz` is the liveness probe.
- `GET /readyz` is the readiness probe.
- `NUXT_PUBLIC_APP_VERSION` and `NUXT_PUBLIC_COMMIT_SHA` identify the running artifact and are safe to expose publicly.
- Runtime secrets, when introduced by a reviewed feature, must be injected by the deployment platform and must not use the `NUXT_PUBLIC_` prefix.

## Branch events

- Pull requests into `develop`: install, lint, typecheck, test, and image build without publishing.
- `develop`: validate, publish an immutable non-production image, deploy to a non-production environment, then probe `/healthz` and `/readyz`.
- `main`: publish and deploy only through an explicitly approved promotion after the corresponding `develop` artifact is validated.

The external deployment implementation owns registry authentication, image naming, environment mapping, rollout, rollback, and retention. Those values are intentionally not encoded here.
