# CI and deployment interface

This document defines the repository side of the deferred shared kdeploy D3 CI/deployment boundary. D3 is a later, unimplemented kdeploy branch. Its D1 security prerequisite is the canonical restricted-access [pointitconsulting/klynx-cluster-deploy PR #131](https://github.com/pointitconsulting/klynx-cluster-deploy/pull/131); PR #131 is only that security prerequisite and does not implement D3. This citation records infrastructure provenance only and does not couple this application's product or domain model to another system.

**No deployment automation exists for this repository yet.** The branch behavior below is a contract for the future D3 implementation, not a claim that CI currently publishes or deploys this service. This repository deliberately does not assume credential identifiers, registry locations, clusters, namespaces, or a particular CI controller configuration.

## CI inputs

- A clean checkout at an immutable Git commit.
- Node.js 22.18.0 or newer within the 22.x release line and Corepack, or a container builder capable of the checked-in `Dockerfile`.
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
- The immutable image digest reference (`registry/repository@sha256:...`) and source commit SHA recorded by CI.
- Mutable tags may aid discovery, but deployment and rollback must select an immutable digest rather than a tag.
- No `.env` file or secret included in the build context, image metadata, or layers.

## Runtime contract

- Listen on `0.0.0.0:3000` by default; `HOST` and `PORT` may be overridden.
- Run as the image's non-root `node` user.
- `GET /healthz` is the liveness probe.
- `GET /readyz` is the readiness probe.
- `NUXT_PUBLIC_APP_VERSION` and `NUXT_PUBLIC_COMMIT_SHA` identify the running artifact and are safe to expose publicly.
- Runtime secrets, when introduced by a reviewed feature, must be injected by the deployment platform and must not use the `NUXT_PUBLIC_` prefix.

## Trigger and evidence contract

- Pull requests into `develop`: the exact head SHA triggers install, lint, typecheck, test, and an image build without publishing. Evidence records the SHA and every check result.
- `develop`: after D3 exists, the exact merge SHA triggers validation and publication. Evidence records the source SHA, package version, immutable image digest, validation results, deployment target, rollout result, and `/healthz` and `/readyz` responses.
- `main`: an explicitly approved promotion selects the same immutable digest already validated from `develop`; it must not silently rebuild or substitute an image by mutable tag. Evidence records the approval, selected digest, source SHA, target, rollout result, and probe responses.

## Rollout and rollback selection

- A rollout request identifies the environment and exact OCI digest selected from successful CI evidence.
- The deployment controller applies that digest and records who or what triggered the rollout, its time, previous digest, selected digest, source SHA, and final probe/rollout status.
- A rollback selects a previously recorded known-good digest. It never resolves `latest` or another mutable tag at rollback time.
- Rollback evidence records the failed digest, restored digest, reason, actor, timestamps, controller result, and post-rollback probe responses.
- Registry authentication, deployment credentials, environment mapping, rollout mechanics, and retention remain owned by the external deployment implementation and are intentionally absent here.

Until the deferred shared kdeploy D3 dependency is implemented and connected, publishing, rollout, promotion, and rollback are unavailable—not manual steps implied by this repository.
