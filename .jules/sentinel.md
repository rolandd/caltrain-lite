## 2024-05-24 - API Key Exposure via Plaintext URL Logging

**Vulnerability:** The `TRANSIT_511_API_KEY` was exposed in plaintext to stdout when logging `console.log(url)` because the key was appended as a query parameter string interpolation.
**Learning:** Even internal dev/fixture scripts need careful handling of secrets. Constructing URLs via string interpolation bypasses encoding and makes it easy to accidentally log the full URL (including secrets). Error messages also inadvertently leak secrets in stack traces if not sanitized.
**Prevention:** Always use `URL` and `URLSearchParams` to construct URLs. Avoid logging raw URLs that contain secrets. Wrap fetches in `try...catch` blocks that explicitly sanitize `err.message` and `err.stack` (replacing the plain and url-encoded secret with `REDACTED`).

## 2024-05-24 - Restrict Cloudflare Worker API methods

**Vulnerability:** The API fetch handler in Cloudflare workers did not restrict HTTP methods, so it handled everything (POST, PUT, DELETE, etc.) just like a GET request. This is a bad practice for read-only APIs and could allow logic bypasses.
**Learning:** Cloudflare Workers do not automatically filter HTTP methods. Read-only APIs must explicitly restrict accepted HTTP methods inside their fetch handlers to GET, HEAD, and OPTIONS (to ensure CORS preflight checks don't break), returning 405 Method Allowed with security headers for unsupported methods to prevent CSRF or logic bypasses.
**Prevention:** Always check `request.method` in Cloudflare Worker `fetch` handlers and reject unsupported methods (e.g. POST to read-only APIs) with `405 Method Not Allowed`.

## 2026-07-24 - Prototype Pollution in Dictionary Initialization

**Vulnerability:** Initializing dictionaries with `{}` when using unvalidated external string keys (like GTFS-RT feed IDs) allows prototype pollution if attackers supply malicious keys like `__proto__`.
**Learning:** Using plain JavaScript objects for mappings exposes the object prototype to manipulation, which can lead to prototype pollution and affect the whole application's behavior.
**Prevention:** Always initialize dictionaries with `Object.create(null)` instead of `{}` when the keys are unvalidated and externally supplied to prevent prototype pollution.
