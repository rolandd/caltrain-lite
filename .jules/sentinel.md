## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2024-05-24 - Missing HTTP Method Validation in Worker Read-Only APIs
**Vulnerability:** The worker's `fetch` handler did not restrict HTTP methods for its read-only endpoints (`/api/schedule`, `/api/meta`, `/api/realtime`). It would process any method (e.g., POST, PUT, DELETE) identically to a GET request.
**Learning:** Cloudflare Workers do not automatically enforce method constraints. While this application doesn't currently accept mutating data via these endpoints, accepting arbitrary methods on read-only APIs violates the principle of least privilege, bypasses expectations about idempotency, and could be a vector for CSRF or unhandled errors if internal logic assumptions (like `request.body` handling) evolve.
**Prevention:** Always explicitly guard the entry point of API handlers. For read-only endpoints, verify that `request.method` is `GET`, `HEAD`, or `OPTIONS` (to allow preflight), and return a `405 Method Not Allowed` with appropriate security headers for all other requests.
