## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2026-05-22 - Cloudflare Workers Missing Default HTTP Method Filtering

**Vulnerability:** Read-only API routes in the Cloudflare Worker did not explicitly restrict accepted HTTP methods. This means requests with POST, PUT, DELETE, or PATCH methods would be processed and could bypass caching or security checks, and depending on the logic, could lead to unexpected behavior or CSRF bypasses.
**Learning:** Cloudflare Workers' `fetch` handler does not automatically filter HTTP methods. Developers must explicitly check `request.method` to ensure only intended methods (like GET, HEAD, OPTIONS) are allowed.
**Prevention:** Always check and restrict `request.method` in Cloudflare Workers for API routes. Return a `405 Method Not Allowed` with the allowed methods in the `Allow` header for unsupported requests. Ensure `OPTIONS` is supported so CORS preflight requests do not fail.
