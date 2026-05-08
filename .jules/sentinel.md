## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2024-05-24 - Missing HTTP Method Filtering in Cloudflare Workers

**Vulnerability:** The worker `fetch` handler did not restrict HTTP methods, accepting potentially modifying requests (like POST, PUT, DELETE) on read-only endpoints, which could bypass security checks or lead to unexpected behavior if handlers assume only GET requests.
**Learning:** Cloudflare Workers do not automatically filter HTTP methods. Read-only APIs must explicitly restrict accepted HTTP methods inside their fetch handlers to GET, HEAD, and OPTIONS (for CORS), returning 405 Method Not Allowed with security headers for unsupported methods.
**Prevention:** Always check `request.method` at the beginning of the `fetch` handler for API endpoints and reject unexpected methods.
