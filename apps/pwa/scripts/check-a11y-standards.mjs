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

function parseAttributes(rawAttrs) {
  const attrs = {};
  let i = 0;
  while (i < rawAttrs.length) {
    while (i < rawAttrs.length && /\s/.test(rawAttrs[i])) i++;
    if (i >= rawAttrs.length) break;
    const nameStart = i;
    while (i < rawAttrs.length && !/[\s=>]/.test(rawAttrs[i])) i++;
    const name = rawAttrs.slice(nameStart, i);
    while (i < rawAttrs.length && /\s/.test(rawAttrs[i])) i++;
    if (i < rawAttrs.length && rawAttrs[i] === '=') {
      i++;
      while (i < rawAttrs.length && /\s/.test(rawAttrs[i])) i++;
      if (rawAttrs[i] === '"' || rawAttrs[i] === "'") {
        const quote = rawAttrs[i++];
        const valStart = i;
        while (i < rawAttrs.length && rawAttrs[i] !== quote) i++;
        attrs[name] = rawAttrs.slice(valStart, i);
        i++;
      } else if (rawAttrs[i] === '{') {
        let depth = 1;
        i++;
        const valStart = i;
        while (i < rawAttrs.length && depth > 0) {
          if (rawAttrs[i] === '{') depth++;
          else if (rawAttrs[i] === '}') depth--;
          i++;
        }
        attrs[name] = rawAttrs.slice(valStart, i - 1);
      } else {
        const valStart = i;
        while (i < rawAttrs.length && !/\s/.test(rawAttrs[i])) i++;
        attrs[name] = rawAttrs.slice(valStart, i);
      }
    } else {
      attrs[name] = true;
    }
  }
  return attrs;
}

/**
 * Parses tags from HTML/Svelte markup, properly handling braces and quotes.
 */
function parseTags(content) {
  const tags = [];
  const startRegex = /<([a-zA-Z0-9-]+)\s+/g;
  let match;
  while ((match = startRegex.exec(content)) !== null) {
    const tagName = match[1];
    let i = match.index + match[0].length;
    let inQuote = null;
    let braceDepth = 0;
    let rawAttrs = '';
    while (i < content.length) {
      const char = content[i];
      if (inQuote) {
        if (char === inQuote && content[i - 1] !== '\\') {
          inQuote = null;
        }
      } else if (char === '"' || char === "'") {
        inQuote = char;
      } else if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        if (braceDepth > 0) braceDepth--;
      } else if (char === '>' && braceDepth === 0) {
        break;
      }
      rawAttrs += char;
      i++;
    }
    const attrs = parseAttributes(rawAttrs);
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

      // Rule 5: Custom elements with role="button" must handle Space key with preventDefault
      if (attrs.role === 'button') {
        const rawAttrs = tag.rawAttrs;
        const handlesSpace = rawAttrs.includes("' '") || rawAttrs.includes('" "');
        const hasPreventDefault = rawAttrs.includes('preventDefault');
        if (!handlesSpace || !hasPreventDefault) {
          failures.push({
            file: relPath,
            rule: 'Button Space Key Support',
            message: `<${tagName} role="button"> must handle Space key activation and call preventDefault() to prevent page scrolling.`,
          });
        }
      }

      // Rule 6: Modal dialogs with backdrop must specify aria-modal="true"
      if (attrs.role === 'dialog' && content.includes('fixed inset-0')) {
        if (attrs['aria-modal'] !== 'true' && attrs['aria-modal'] !== true) {
          failures.push({
            file: relPath,
            rule: 'Modal Dialog ARIA',
            message: `<${tagName} role="dialog"> with a backdrop must declare aria-modal="true".`,
          });
        }
      }
    }

    // Rule 7: Modal dialog components must handle Escape key dismissal in an $effect block
    if (content.includes('role="dialog"') && content.includes('aria-modal="true"')) {
      const handlesEscape = content.includes("'Escape'") || content.includes('"Escape"');
      const hasEffect = content.includes('$effect');
      if (!handlesEscape || !hasEffect) {
        failures.push({
          file: relPath,
          rule: 'Modal Escape Dismissal',
          message: `Modal dialog components must handle Escape key dismissal in an $effect block.`,
        });
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
