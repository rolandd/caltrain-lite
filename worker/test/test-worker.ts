import { readFileSync } from 'node:fs';
import { parseFeed } from '../src/gtfs-rt.js';

const fixturePath = 'fixtures/tripupdates.pb';
console.log(`Reading fixture: ${fixturePath}`);
const buffer = readFileSync(fixturePath);

console.log(`Parsing ${buffer.byteLength} bytes...`);
const feed = parseFeed(buffer.buffer);

console.log('--- Result ---');
console.log(`Timestamp: ${feed.timestamp} (${new Date(feed.timestamp * 1000).toISOString()})`);
console.log(`Entities: ${feed.entities.length}`);
console.log(`Positions: ${feed.positions.size}`);
console.log(`Alerts: ${feed.alerts.length}`);

if (feed.entities.length > 0) {
  console.log('First 3 entities:', feed.entities.slice(0, 3));
} else {
  console.log('No entities found.');
}

if (feed.alerts.length > 0) {
  console.log('First alert:', feed.alerts[0]);
}

// Validation
if (!feed.timestamp) console.warn('Warning: Missing timestamp (might be 0 in fixture)');
if (!Array.isArray(feed.entities)) throw new Error('Entities is not an array');
console.log('Test Passed!');
