# Secrets Management

This project uses secrets in two places: GitHub Actions (for CI/CD) and Cloudflare Workers (for runtime).

## GitHub Secrets

These secrets are needed for the `.github/workflows/sync-schedule.yml` workflow to fetch data from 511.org and upload it to Cloudflare KV.

| Secret Name             | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `TRANSIT_511_API_KEY`   | API Key from 511.org Open Data                   |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API Token with Workers/KV write access|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID                       |

### Setting Secrets via CLI

You can populate these secrets using the GitHub CLI (`gh`):

```bash
# 511.org API Key
gh secret set TRANSIT_511_API_KEY < api_key.txt

# Cloudflare Credentials
gh secret set CLOUDFLARE_API_TOKEN < cloudflare_token.txt
gh secret set CLOUDFLARE_ACCOUNT_ID < cloudflare_account_id.txt
```

## Worker Secrets

These secrets are available to the Cloudflare Worker at runtime (accessed via `env.SECRET_NAME`).

| Secret Name           | Description                     |
| --------------------- | ------------------------------- |
| `TRANSIT_511_API_KEY` | API Key from 511.org Open Data  |

### Setting Secrets via Wrangler

**Production:**
Run this command securely in your terminal (it will prompt for input):

```bash
npx wrangler secret put TRANSIT_511_API_KEY
```

**Local Development:**
Create a `.dev.vars` file in the project root (gitignored):

```env
TRANSIT_511_API_KEY=your_actual_api_key_here
```
