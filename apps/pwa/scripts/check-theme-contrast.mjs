#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const THEME_PATH = path.resolve(THIS_DIR, '../src/app.css');
const TOKEN_RE = /--color-([a-z0-9-]+)\s*:\s*([^;]+);/g;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const VAR_RE = /^var\(--color-([a-z0-9-]+)\)$/;

const checks = [
  {
    fg: 'transit-text-primary',
    bg: 'transit-surface-canvas',
    min: 4.5,
    label: 'Primary text on canvas',
  },
  {
    fg: 'transit-text-secondary',
    bg: 'transit-surface-canvas',
    min: 4.5,
    label: 'Secondary text on canvas',
  },
  { fg: 'transit-text-muted', bg: 'transit-surface-card', min: 4.5, label: 'Muted text on card' },
  {
    fg: 'transit-text-tertiary',
    bg: 'transit-surface-card',
    min: 4.5,
    label: 'Tertiary text on card',
  },
  { fg: 'transit-brand', bg: 'transit-surface-canvas', min: 4.5, label: 'Brand text on canvas' },
  { fg: 'transit-danger', bg: 'transit-surface-card', min: 4.5, label: 'Danger text on card' },
  { fg: 'transit-warning', bg: 'transit-surface-card', min: 4.5, label: 'Warning text on card' },
  {
    fg: 'transit-warning-medium',
    bg: 'transit-surface-card',
    min: 4.5,
    label: 'Warning-medium text on card',
  },
  {
    fg: 'transit-brand-soft-text',
    bg: 'transit-brand-soft-bg',
    min: 4.5,
    label: 'Soft brand text on soft brand bg',
  },
  {
    fg: 'transit-alert-heading',
    bg: 'transit-alert-bg',
    min: 4.5,
    label: 'Alert heading on alert bg',
  },
  { fg: 'route-local-badge-text', bg: 'route-local-badge-bg', min: 4.5, label: 'Local badge text' },
  {
    fg: 'route-limited-badge-text',
    bg: 'route-limited-badge-bg',
    min: 4.5,
    label: 'Limited badge text',
  },
  {
    fg: 'route-bullet-badge-text',
    bg: 'route-bullet-badge-bg',
    min: 4.5,
    label: 'Bullet badge text',
  },
  {
    fg: 'transit-border-default',
    bg: 'transit-surface-card',
    min: 3.0,
    label: 'Default border on card',
  },
  {
    fg: 'transit-border-strong',
    bg: 'transit-tooltip-bg',
    min: 3.0,
    label: 'Strong border on tooltip',
  },
  {
    fg: 'transit-border-danger',
    bg: 'transit-alert-bg',
    min: 3.0,
    label: 'Danger border on alert bg',
  },
];

function parseTokens(cssSource) {
  const tokens = new Map();
  let match;
  while ((match = TOKEN_RE.exec(cssSource)) !== null) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function resolveTokenColor(tokenName, tokens, seen = new Set()) {
  if (seen.has(tokenName)) {
    throw new Error(`Cyclic token reference: ${tokenName}`);
  }
  const rawValue = tokens.get(tokenName);
  if (!rawValue) {
    throw new Error(`Missing token: --color-${tokenName}`);
  }

  if (HEX_RE.test(rawValue)) {
    return rawValue;
  }

  const ref = rawValue.match(VAR_RE);
  if (ref) {
    seen.add(tokenName);
    return resolveTokenColor(ref[1], tokens, seen);
  }

  throw new Error(
    `Token --color-${tokenName} must be a hex color or var() alias, got: ${rawValue}`,
  );
}

function hexToRgb(hex) {
  const raw = hex.slice(1);
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function srgbToLinear(component) {
  const normalized = component / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(foregroundHex, backgroundHex) {
  const fg = luminance(foregroundHex);
  const bg = luminance(backgroundHex);
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg];
  return (lighter + 0.05) / (darker + 0.05);
}

async function main() {
  const cssSource = await fs.readFile(THEME_PATH, 'utf8');
  const tokens = parseTokens(cssSource);
  const failures = [];

  for (const check of checks) {
    const fg = resolveTokenColor(check.fg, tokens);
    const bg = resolveTokenColor(check.bg, tokens);
    const ratio = contrastRatio(fg, bg);
    if (ratio < check.min) {
      failures.push({ ...check, ratio, fg, bg });
    }
  }

  if (failures.length > 0) {
    console.error('WCAG contrast checks failed for apps/pwa theme tokens:');
    for (const failure of failures) {
      console.error(
        `  ${failure.label}: ${failure.ratio.toFixed(2)}:1 < ${failure.min}:1 (${failure.fg} on ${failure.bg})`,
      );
    }
    process.exit(1);
  }

  console.log(`Theme contrast checks passed (${checks.length} token pairs).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
