# Contributing to Transit

Would love to have your contributions to this project as GitHub
PRs. By submitting anything you are implicitly licensing it under the
same MIT license as the rest of the project.

Here are some innstructions for setting up your development
environment and making changes.

## Prerequisites

- **Node.js**: Version 24 or higher is recommended.
- **npm**: Used for dependency management.
- **Wrangler**: Cloudflare's CLI tool (`npm install -g wrangler` or use via `npx`).

## Getting Started

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd transit
    ```

2.  **Install dependencies:**
    We use npm workspaces, so running install at the root installs dependencies for all packages.

    ```bash
    npm install
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
npm run dev --prefix apps/pwa
```

This command will:

1.  Run the `generate` script to fetch/parse GTFS data (so you have local schedule data).
2.  Start the Vite development server.

### Backend (Worker)

To develop the Cloudflare Worker locally:

```bash
cd worker
npx wrangler dev
```

This will start a local instance of the Worker, emulating Cloudflare's environment.

## Testing

We use `vitest` for the PWA and custom test scripts for other parts.

- **Run all tests:**

  ```bash
  npm test
  ```

- **Run PWA tests only:**

  ```bash
  npm test --prefix apps/pwa
  ```

- **Run Worker tests only:**
  ```bash
  npm test --prefix worker
  ```

## Linting & Formatting

We use ESLint and Prettier to maintain code quality.

- **Lint code:**

  ```bash
  npm run lint
  ```

- **Format code:**
  ```bash
  npm run format
  ```

## Documentation

- [System Architecture](docs/ARCHITECTURE.md): Deep dive into the system design, data flows, and schemas.
- [Deployment Guide](docs/DEPLOYMENT.md): How to deploy the stack to Cloudflare.
- [Security](docs/SECURITY.md): Security implementation details.
