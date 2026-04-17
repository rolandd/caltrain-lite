## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2026-04-17 - Explicit Method Restrictions on Read-Only APIs

**Vulnerability:** The `fetch` handler in the Cloudflare Worker did not explicitly restrict HTTP methods, meaning it would process any method (e.g., `POST`, `PUT`, `DELETE`) as if it were a `GET` request if the path matched. This could lead to unintended logic execution or bypasses if caching layers or middleware react differently to non-GET methods.
**Learning:** Read-only APIs must explicitly restrict accepted HTTP methods inside their fetch handlers, returning `405 Method Not Allowed` for unsupported methods. Crucially, security headers must be included even on these error responses to prevent CSRF or logic bypasses that exploit missing headers on non-200 responses.
**Prevention:** Always check `request.method` at the beginning of the handler. If it's not `GET` or `HEAD`, return a `405` status immediately, ensuring the global `securityHeaders` are attached to the response.
