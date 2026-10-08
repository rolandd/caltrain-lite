// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { redact } from './redact';

describe('Property-Based Testing: Secret Redaction (redact)', () => {
  // Generate secrets that are at least 1 character and not merely a substring
  // of the replacement token "[REDACTED]". Also exclude secrets containing the
  // token's bracket characters: redact replaces matches with "[REDACTED]", so
  // surrounding text can combine with the token to re-form the secret across
  // the boundary (e.g. secret " [" with text "... token:  [ ..." yields
  // "token: [REDACTED] url" which still contains " ["). Real API keys are
  // alphanumeric, so these pathological secrets are outside the contract.
  const secretArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !'[REDACTED]'.includes(s) && !s.includes('[') && !s.includes(']'));

  describe('Property 1: Absolute Secret Leakage Prevention', () => {
    it('guarantees neither raw nor URI-encoded secret remains in the redacted output', () => {
      fc.assert(
        fc.property(
          secretArb,
          fc.string({ maxLength: 100 }),
          fc.string({ maxLength: 100 }),
          fc.string({ maxLength: 100 }),
          (secret, prefix, middle, suffix) => {
            const rawEmbedded = `${prefix}${secret}${middle}${encodeURIComponent(secret)}${suffix}`;
            const redacted = redact(rawEmbedded, secret);

            expect(redacted.includes(secret)).toBe(false);
            expect(redacted.includes(encodeURIComponent(secret))).toBe(false);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('redacts all repeated occurrences across arbitrary text', () => {
      fc.assert(
        fc.property(
          secretArb,
          fc.array(fc.string({ maxLength: 30 }), { minLength: 1, maxLength: 10 }),
          (secret, chunks) => {
            // Interleave chunks with secret and encodedSecret
            const text = chunks.join(secret) + encodeURIComponent(secret);
            const redacted = redact(text, secret);

            expect(redacted.includes(secret)).toBe(false);
            expect(redacted.includes(encodeURIComponent(secret))).toBe(false);
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe('Property 2: Mathematical Idempotence', () => {
    it('redacting an already redacted string is an idempotent no-op', () => {
      fc.assert(
        fc.property(fc.string(), secretArb, (str, secret) => {
          const once = redact(str, secret);
          const twice = redact(once, secret);
          expect(twice).toBe(once);
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('Property 3: Identity & Neutral Elements', () => {
    it('returns original string unchanged when secret is null, undefined, or empty', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.constantFrom(null, undefined, ''),
          (str, emptySecret) => {
            expect(redact(str, emptySecret)).toBe(str);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('preserves string unchanged when secret does not occur in text', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 50 }),
          fc.string({ minLength: 4, maxLength: 20 }),
          (str, secretCandidate) => {
            // Ensure candidate secret does not appear anywhere in str
            fc.pre(!str.includes(secretCandidate) && !str.includes(encodeURIComponent(secretCandidate)));
            expect(redact(str, secretCandidate)).toBe(str);
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe('Property 4: Robustness with Complex & Dangerous Characters', () => {
    it('handles regex metacharacters, punctuation, emojis, and URI symbols safely', () => {
      const specialCharArb = fc
        .array(
          fc.constantFrom(
            '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\',
            '/', '&', '=', '%', '#', ' ', ':', ';', '!', '@', '"', "'", '<', '>', '🚀'
          ),
          { minLength: 2, maxLength: 20 },
        )
        .map((chars) => chars.join(''))
        // Same boundary rule as secretArb: no '[' or ']' inside the secret.
        .filter((s) => !'[REDACTED]'.includes(s) && !s.includes('[') && !s.includes(']'));

      fc.assert(
        fc.property(
          specialCharArb,
          fc.string({ maxLength: 50 }).filter((s) => !s.endsWith('=')),
          (secret, context) => {
            const text = `${context} token: ${secret} url: ${encodeURIComponent(secret)}`;
            const redacted = redact(text, secret);

            expect(redacted.includes(secret)).toBe(false);
            expect(redacted.includes(encodeURIComponent(secret))).toBe(false);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
