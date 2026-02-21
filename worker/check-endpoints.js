// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { readFileSync, writeFileSync } from 'node:fs';

const apiKeyRaw = readFileSync('../../API_KEY', 'utf-8');
const match = apiKeyRaw.match(/TRANSIT_511_API_KEY="([^"]+)"/);
if (!match) throw new Error('Could not parse API_KEY file');
const apiKey = match[1];

const endpoints = ['ServiceAlerts', 'VehiclePositions'];

async function check() {
  for (const ep of endpoints) {
    const url = `https://api.511.org/Transit/${ep}?api_key=${apiKey}&agency=CT`;
    console.log(`Fetching ${ep}...`);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Failed ${ep}: ${resp.status}`);
        continue;
      }
      const buffer = await resp.arrayBuffer();
      console.log(`Success ${ep}: ${buffer.byteLength} bytes`);
      writeFileSync(`fixtures/${ep.toLowerCase()}.pb`, Buffer.from(buffer));
    } catch (e) {
      console.error(`Error ${ep}:`, e);
    }
  }
}

check();
