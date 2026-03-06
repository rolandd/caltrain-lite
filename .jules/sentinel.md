## 2025-03-05 - Overly Permissive CORS Configuration

**Vulnerability:** The API Worker was configured with overly permissive CORS headers (`Access-Control-Allow-Origin: *`), violating the documented same-origin design and potentially allowing cross-origin requests.
**Learning:** Even when documentation (`docs/SECURITY.md`) specifies a strict same-origin policy without CORS headers, developers might inadvertently copy-paste or include boilerplate CORS settings, creating an unexpected architectural security gap.
**Prevention:** Ensure API workers explicitly enforce the intended Same-Origin Policy. Do not include wildcard CORS headers on endpoints that are not intended for public cross-origin consumption. Regularly verify that the implementation aligns with the documented security model.
