# Repository Guidelines

- Keep this repository free of secrets and environment-specific credentials.
- Use feature branches from `develop`; open pull requests back to `develop`.
- Promote reviewed and validated changes from `develop` to `main`.
- Keep application concerns within this repository and document external integration contracts before implementation.
- Do not commit `.env` files, generated output, dependency directories, or local tool state.
- Run lightweight checks locally. Production image builds and deployments belong in CI.

