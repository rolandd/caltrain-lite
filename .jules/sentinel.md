## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).
## 2026-04-18 - HTTP Method Filtering in Cloudflare Workers
**Vulnerability:** Cloudflare Workers' fetch handler did not explicitly check `request.method`, allowing potentially unintended HTTP verbs (e.g., POST, PUT, DELETE) to reach the API logic.
**Learning:** Cloudflare Workers do not automatically filter HTTP methods. Read-only APIs must explicitly restrict accepted HTTP methods inside their fetch handlers to GET, HEAD, and OPTIONS (to ensure CORS preflight checks don't break), returning 405 Method Not Allowed with security headers for unsupported methods to prevent CSRF or logic bypasses.
**Prevention:** Always add an explicit `request.method` check at the very beginning of the `fetch` handler to return a 405 for methods that the worker is not designed to handle.
