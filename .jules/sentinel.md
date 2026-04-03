## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2024-05-25 - API Endpoints Permitting Unexpected Methods

**Vulnerability:** The API routes (`/api/schedule`, `/api/meta`, `/api/realtime`) handled by the Cloudflare Worker did not validate the HTTP method. A `POST` or `DELETE` request would be processed exactly the same as a `GET` request.
**Learning:** Even read-only APIs must explicitly restrict accepted HTTP methods (e.g., to `GET` and `HEAD`). Relying on the absence of side-effects rather than strict method enforcement leaves the application vulnerable to subtle Cross-Site Request Forgery (CSRF) or logic bypasses if the API evolves.
**Prevention:** Always implement an early check for `request.method` inside fetch handlers, returning `405 Method Not Allowed` for unsupported methods. Ensure security headers are included even on these error responses.
