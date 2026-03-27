## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2024-05-24 - Permissive CORS Configuration Exposed Same-Origin API

**Vulnerability:** The API endpoints in `worker/src/index.ts` included permissive CORS headers (`'Access-Control-Allow-Origin': '*'`), allowing cross-origin requests despite the security policy (`docs/SECURITY.md`) specifying that the API should be same-origin only.
**Learning:** Adding wide-open CORS headers to an API meant solely for internal/same-origin use violates the principle of least privilege and increases the attack surface, potentially enabling unauthorized websites to interact with the API or abuse it.
**Prevention:** Strictly align CORS configuration with the intended usage of the API. For same-origin APIs, do not include any `Access-Control-Allow-*` headers and rely on default browser same-origin policies supplemented with strong security headers (e.g., `Cross-Origin-Resource-Policy: same-origin`).
