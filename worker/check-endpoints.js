// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readFileSync, writeFileSync } from 'node:fs';

const apiKey = process.env.TRANSIT_511_API_KEY;
if (!apiKey) throw new Error('Missing TRANSIT_511_API_KEY environment variable');

const endpoints = ['ServiceAlerts', 'VehiclePositions'];

async function check() {
  for (const ep of endpoints) {
    const url = new URL(`https://api.511.org/Transit/${ep}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('agency', 'CT');
    console.log(`Fetching ${ep}...`);
    try {
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        console.error(`Failed ${ep}: ${resp.status}`);
        continue;
      }
      const buffer = await resp.arrayBuffer();
      console.log(`Success ${ep}: ${buffer.byteLength} bytes`);
      writeFileSync(`fixtures/${ep.toLowerCase()}.pb`, Buffer.from(buffer));
    } catch (err) {
      const errStr = err instanceof Error ? err.stack || err.message : String(err);
      let redacted = errStr;
      redacted = redacted.replaceAll(apiKey, 'REDACTED');
      const encodedKey = encodeURIComponent(apiKey);
      if (encodedKey !== apiKey) {
        redacted = redacted.replaceAll(encodedKey, 'REDACTED');
      }
      console.error(`Error ${ep}:`, redacted);
    }
  }
}

check();
