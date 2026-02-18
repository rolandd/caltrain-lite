/**
 * Cloudflare Pages Function middleware
 * Injects a cryptographic nonce into inline <script> tags and sets a
 * Content-Security-Policy header that allows only those nonced scripts.
 */

type Env = Record<string, never>;

// Generate a 128-bit base64-encoded nonce (per CSP spec recommendation)
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa from raw bytes
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

class ScriptNonceInjector implements HTMLRewriterElementContentHandlers {
  private nonce: string;
  constructor(nonce: string) {
    this.nonce = nonce;
  }
  element(el: Element) {
    // Only add nonce to inline scripts (no src attribute)
    if (!el.getAttribute('src')) {
      el.setAttribute('nonce', this.nonce);
    }
  }
}

class LinkNonceInjector implements HTMLRewriterElementContentHandlers {
  private nonce: string;
  constructor(nonce: string) {
    this.nonce = nonce;
  }
  element(el: Element) {
    const rel = el.getAttribute('rel');
    if (rel === 'modulepreload') {
      el.setAttribute('nonce', this.nonce);
    }
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();

  // Only rewrite HTML responses
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const nonce = generateNonce();

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self'`,
    `img-src 'self' data:`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'none'`,
  ].join('; ');

  const rewritten = new HTMLRewriter()
    .on('script', new ScriptNonceInjector(nonce))
    .on('link', new LinkNonceInjector(nonce))
    .transform(response);

  // Clone headers so we can modify them
  const headers = new Headers(rewritten.headers);
  headers.set('Content-Security-Policy', csp);

  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
};
