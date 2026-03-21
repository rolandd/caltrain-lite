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
  let redacted = str;

  redacted = redacted.replaceAll(secret, '[REDACTED]');

  const encodedKey = encodeURIComponent(secret);
  if (encodedKey !== secret) {
    redacted = redacted.replaceAll(encodedKey, '[REDACTED]');
  }

  return redacted;
}
