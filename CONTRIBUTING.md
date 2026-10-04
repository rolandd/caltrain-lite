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

### Property-Based Testing (`fast-check`)

When making changes to algorithms, scheduling math, data parsers, or API transformations, prefer or supplement targeted unit tests with **Property-Based Testing (PBT)** using [`fast-check`](https://fast-check.dev/).

Targeted unit tests verify that known examples work; property tests verify that invariants hold across thousands of randomly generated inputs, edge cases, and schedule permutations.

**Key areas where PBT should be used:**

- **Differential testing / migrations:** Verifying that a new algorithm or data format (e.g. v2 pattern lookup) produces results identical to the reference implementation across all inputs (`*.prop.test.ts`).
- **Mathematical invariants & round-trips:** Formatting and parsing (e.g. `timeToMinutes(minutesToTime(m)) === m`), fare matrix symmetry (`fare(A, B) === fare(B, A)`), and sorting stability.
- **Data integrity & parser invariants:** Verifying GTFS parser invariants (pattern coverage, array alignment, topological ordering) against arbitrary synthetic inputs.

Example:

```typescript
import * as fc from 'fast-check';

it('satisfies invariant across arbitrary inputs', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 2880 }), (minutes) => {
      expect(parseTime(formatTime(minutes))).toBe(minutes);
    }),
    { numRuns: 1000 },
  );
});
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
