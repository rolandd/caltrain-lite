#!/usr/bin/env node

// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, '../src');

async function getSvelteFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getSvelteFiles(fullPath)));
    } else if (entry.name.endsWith('.svelte')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Parses tags from HTML/Svelte markup.
 */
function parseTags(content) {
  const tagRegex = /<([a-zA-Z0-9-]+)\s+([^>]*?)>/gs;
  const tags = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1];
    const rawAttrs = match[2];
    const attrs = {};

    // Parse key-value attributes
    const attrRegex = /([a-zA-Z0-9-:]+)(?:=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const key = attrMatch[1];
      const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? true;
      attrs[key] = val;
    }

    tags.push({
      tagName,
      rawAttrs,
      attrs,
      index: match.index,
    });
  }
  return tags;
}

async function main() {
  const files = await getSvelteFiles(SRC_DIR);
  const failures = [];

  for (const filePath of files) {
    const relPath = path.relative(SRC_DIR, filePath);
    const content = await fs.readFile(filePath, 'utf8');
    const tags = parseTags(content);

    for (const tag of tags) {
      const { tagName, attrs } = tag;

      // Rule 1: Invisible dismiss backdrops must have tabindex="-1"
      if (tagName === 'button') {
        const isBackdrop =
          (typeof attrs.class === 'string' &&
            attrs.class.includes('fixed inset-0') &&
            attrs.class.includes('bg-transparent')) ||
          attrs['aria-label'] === 'Close tooltip';

        if (isBackdrop && attrs.tabindex !== '-1') {
          failures.push({
            file: relPath,
            rule: 'Backdrop Tabindex',
            message:
              'Invisible backdrop buttons must have tabindex="-1" to avoid tab traps for keyboard users.',
          });
        }
      }

      // Rule 2: Buttons with aria-label should also have title attributes for desktop tooltips
      if (tagName === 'button' && attrs['aria-label']) {
        // Exempt standard text-only buttons where aria-label is redundant
        const hasTitle = Boolean(attrs.title);
        const isBackdrop = attrs.tabindex === '-1' || attrs['aria-label'] === 'Close tooltip';
        if (!hasTitle && !isBackdrop) {
          failures.push({
            file: relPath,
            rule: 'Button Title Tooltip',
            message: `<button aria-label="${attrs['aria-label']}"> is missing a title="..." attribute for desktop browser tooltips.`,
          });
        }
      }

      // Rule 3: Interactive elements (buttons and role="button") should have focus-visible styling
      const isInteractive = tagName === 'button' || attrs.role === 'button';
      if (isInteractive) {
        const isBackdrop =
          attrs.tabindex === '-1' ||
          (typeof attrs.class === 'string' && attrs.class.includes('fixed inset-0'));
        const hasFocusStyle =
          typeof attrs.class === 'string' && attrs.class.includes('focus-visible:');
        if (!hasFocusStyle && !isBackdrop) {
          failures.push({
            file: relPath,
            rule: 'Focus-Visible Ring',
            message: `<${tagName}> element missing focus-visible styling (e.g. focus-visible:ring-2 focus-visible:ring-transit-brand).`,
          });
        }
      }

      // Rule 4: Custom elements with role="button" acting as popups must specify aria-haspopup
      if (
        attrs.role === 'button' &&
        typeof attrs.onclick === 'string' &&
        attrs.onclick.includes('Tooltip')
      ) {
        if (!attrs['aria-haspopup']) {
          failures.push({
            file: relPath,
            rule: 'Tooltip ARIA Popup',
            message: `Interactive tooltip trigger element missing aria-haspopup="dialog".`,
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('Accessibility regression checks failed:');
    for (const f of failures) {
      console.error(`  - [${f.rule}] ${f.file}: ${f.message}`);
    }
    process.exit(1);
  }

  console.log(`Accessibility regression checks passed across ${files.length} Svelte components.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
