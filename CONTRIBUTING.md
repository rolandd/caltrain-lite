# Contributing to Transit

Would love to have your contributions to this project as GitHub
PRs. By submitting anything you are implicitly licensing it under the
same MIT license as the rest of the project.

Here are some innstructions for setting up your development
environment and making changes.

## Prerequisites

- **Node.js**: Version 24 or higher is recommended.
- **pnpm**: Version 11 or higher (used for dependency and workspace management).
- **Wrangler**: Cloudflare's CLI tool (`pnpm add -g wrangler` or use via `pnpm exec wrangler`).

## Getting Started

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd transit
    ```

2.  **Install dependencies:**
    We use pnpm workspaces, so running install at the root installs dependencies for all packages.

    ```bash
    pnpm install
    ```

3.  **Environment Setup:**
    Some components (like the Worker) require environment variables. Refer to [Secrets Management](docs/SECRETS.md) for details on setting up `.dev.vars` for local development.

## Development

The project is a monorepo with the following main workspaces:

- `apps/pwa`: The SvelteKit 5 frontend application.
- `worker`: The Cloudflare Worker backend.
- `scripts`: Utility scripts for data processing.
- `packages/types`: Shared TypeScript definitions.

### Frontend (PWA)

To run the PWA in development mode:

```bash
pnpm --filter pwa dev
```

This command will:

1.  Run the `generate` script to fetch/parse GTFS data (so you have local schedule data).
2.  Start the Vite development server.

### Backend (Worker)

To develop the Cloudflare Worker locally:

```bash
pnpm --filter worker dev
```

This will start a local instance of the Worker, emulating Cloudflare's environment.

## Testing

We use `vitest` for the PWA and custom test scripts for other parts.

- **Run all tests:**

  ```bash
  pnpm test
  ```

- **Run PWA tests only:**

  ```bash
  pnpm --filter pwa test
  ```

- **Run Worker tests only:**

  ```bash
  pnpm --filter worker test
  ```

## Linting & Formatting

We use ESLint and Prettier to maintain code quality.

- **Lint code:**

  ```bash
  pnpm run lint
  ```

- **Format code:**

  ```bash
  pnpm run format
  ```

## Documentation

- [System Architecture](docs/ARCHITECTURE.md): Deep dive into the system design, data flows, and schemas.
- [Deployment Guide](docs/DEPLOYMENT.md): How to deploy the stack to Cloudflare.
- [Security](docs/SECURITY.md): Security implementation details.
