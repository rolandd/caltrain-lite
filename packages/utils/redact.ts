// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

/**
 * Helper function to redact a secret from a string.
 * It will redact both the raw secret and its URI-encoded version.
 *
 * @param str The original string potentially containing the secret
 * @param secret The secret to redact
 * @returns The redacted string
 */
export function redact(str: string, secret?: string | null): string {
  if (!secret) return str;

  const encodedSecret = encodeURIComponent(secret);

  if (encodedSecret === secret) {
    return str.replaceAll(secret, '[REDACTED]');
  }

  // Replace encoded version first to handle cases where the raw secret is a substring of the encoded one.
  return str.replaceAll(encodedSecret, '[REDACTED]').replaceAll(secret, '[REDACTED]');
}
