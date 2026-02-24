#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, '../src');
const FILE_EXTENSIONS = new Set(['.svelte', '.ts', '.js']);
const ARBITRARY_HEX_CLASS_RE =
  /\b(?:text|bg|border|fill|stroke|from|to|via)-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\](?:\/\d{1,3})?\b/g;

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function findViolations(filePath, source) {
  const violations = [];
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    ARBITRARY_HEX_CLASS_RE.lastIndex = 0;
    let match;
    while ((match = ARBITRARY_HEX_CLASS_RE.exec(line)) !== null) {
      violations.push({
        file: filePath,
        line: index + 1,
        column: match.index + 1,
        match: match[0],
      });
    }
  });

  return violations;
}

async function main() {
  const files = await collectFiles(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    violations.push(...findViolations(file, source));
  }

  if (violations.length > 0) {
    console.error('Arbitrary hex Tailwind color classes are not allowed in apps/pwa/src:');
    for (const violation of violations) {
      const relativePath = path.relative(process.cwd(), violation.file);
      console.error(
        `  ${relativePath}:${violation.line}:${violation.column} -> ${violation.match}`,
      );
    }
    process.exit(1);
  }

  console.log('No arbitrary hex Tailwind color classes found in apps/pwa/src.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
