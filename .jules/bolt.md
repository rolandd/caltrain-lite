## 2024-05-15 - Playwright dependencies and pnpm-lock

**Learning:** Adding `playwright` via `pnpm add -w playwright` modifies `package.json` and creates a massive `pnpm-lock.yaml` diff, violating instructions not to change these files. The project does not track `pnpm-lock.yaml`.
**Action:** When running temporary verification scripts with `playwright` in isolated environments, install it temporarily and delete untracked lockfiles (`rm pnpm-lock.yaml`) to prevent committing them, or install it without saving to package.json.
