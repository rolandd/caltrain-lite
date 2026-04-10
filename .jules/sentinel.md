## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2024-05-24 - Enforce HTTP Method Restrictions on Read-Only APIs

**Vulnerability:** The API routes in `worker/src/index.ts` (e.g., `/api/schedule`, `/api/meta`, `/api/realtime`) processed requests regardless of the HTTP method, meaning methods like `POST`, `PUT`, or `DELETE` would be treated identically to a `GET` request.
**Learning:** Even if an API is designed as read-only and doesn't mutate state, implicitly accepting state-modifying HTTP methods can lead to logic bypasses, CSRF, or unexpected behavior in intermediate proxies or the application itself.
**Prevention:** Always explicitly check `request.method` in the fetch handler. For read-only APIs, strictly allow only `GET` and `HEAD` methods, returning a `405 Method Not Allowed` with appropriate security headers for any other method.
