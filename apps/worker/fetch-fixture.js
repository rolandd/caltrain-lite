import { readFileSync, writeFileSync } from 'node:fs';

const apiKeyRaw = readFileSync('../../API_KEY', 'utf-8');
const match = apiKeyRaw.match(/TRANSIT_511_API_KEY="([^"]+)"/);
if (!match) throw new Error('Could not parse API_KEY file');
const apiKey = match[1];
const url = `http://api.511.org/Transit/TripUpdates?api_key=${apiKey}&agency=CT`;

console.log(`Fetching ${url}...`);
const response = await fetch(url);
if (!response.ok) throw new Error(`Failed: ${response.status} ${response.statusText}`);

const arrayBuffer = await response.arrayBuffer();
writeFileSync('fixtures/tripupdates.pb', Buffer.from(arrayBuffer));
console.log(`Wrote ${arrayBuffer.byteLength} bytes to fixtures/tripupdates.pb`);
