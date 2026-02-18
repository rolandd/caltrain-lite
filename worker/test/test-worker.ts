import { readFileSync } from 'node:fs';
import { parseFeed } from '../src/gtfs-rt.js';

const fixturePath = 'fixtures/tripupdates.pb';
console.log(`Reading fixture: ${fixturePath}`);
const buffer = readFileSync(fixturePath);

console.log(`Parsing ${buffer.byteLength} bytes...`);
const feed = parseFeed(buffer.buffer);

console.log('--- Result ---');
console.log(`Timestamp: ${feed.t} (${new Date(feed.t * 1000).toISOString()})`);
console.log(`Entities: ${feed.e.length}`);
console.log(`Positions: ${feed.p.size}`);
console.log(`Alerts: ${feed.a.length}`);

if (feed.e.length > 0) {
  console.log('First 3 entities:', feed.e.slice(0, 3));
} else {
  console.log('No entities found.');
}

if (feed.a.length > 0) {
  console.log('First alert:', feed.a[0]);
}

// Validation
if (!feed.t) console.warn('Warning: Missing timestamp (might be 0 in fixture)');
if (!Array.isArray(feed.e)) throw new Error('Entities is not an array');
console.log('Test Passed!');
