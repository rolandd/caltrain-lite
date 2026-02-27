## 2026-10-27 - [Secret Redaction in Logs]
**Vulnerability:** API keys passed as query parameters were potentially exposed in error logs when fetch exceptions occurred.
**Learning:** `fetch` errors can include the full URL in the stack trace or error message, which may contain sensitive query parameters like `api_key`.
**Prevention:** Always wrap external API calls in a try/catch block and explicitly redact known secrets from the error object before logging. Using `URL` object construction is safer but doesn't automatically prevent leakage in error messages; manual redaction is necessary.
