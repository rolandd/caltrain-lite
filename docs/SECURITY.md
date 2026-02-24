# Security

This app has a minimal attack surface by design: no authentication, no
cookies, no forms, no user-generated content, no PII. All transit data
is public. Despite this, we apply defense-in-depth with comprehensive
security headers.

## Security Headers

All responses include the following headers, configured via Cloudflare Pages [`_headers`](../apps/pwa/static/_headers) file (static assets) and Worker middleware (API routes).

| Header                         | Value                                                                                                                                                                                                                       | Purpose                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Content-Security-Policy`      | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'` | Restrict all resource loading to same-origin. `unsafe-inline` for Svelte scoped styles only. No forms, no framing. |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains; preload`                                                                                                                                                                              | Force HTTPS for 2 years. Protects against downgrade attacks.                                                       |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), autoplay=(), fullscreen=(self)`                                                                             | Deny all sensitive browser APIs we don't use.                                                                      |
| `X-Content-Type-Options`       | `nosniff`                                                                                                                                                                                                                   | Prevent MIME-type sniffing.                                                                                        |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                                                                                                                                                                                           | Minimal referrer leakage.                                                                                          |
| `X-Frame-Options`              | `DENY`                                                                                                                                                                                                                      | Legacy framing protection (CSP `frame-ancestors` covers modern browsers).                                          |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                                                                                                                               | Isolate browsing context.                                                                                          |
| `Cross-Origin-Embedder-Policy` | `require-corp`                                                                                                                                                                                                              | Enable `crossOriginIsolated` context.                                                                              |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                                                                                                                               | Prevent cross-origin resource embedding.                                                                           |

## API Security (Worker)

API routes (`/api/*`) additionally set:

- `Content-Type: application/json; charset=utf-8` — explicit content type.
- Route-specific `Cache-Control` — `/api/meta`: 60s, `/api/schedule`: 3600s, `/api/realtime`: no-cache.
- No CORS headers — API is same-origin only.
