import { readFileSync } from 'node:fs';
import { parseRealtimeStatus } from '../src/gtfs-rt.js';

const fixturePath = 'fixtures/tripupdates.pb';
console.log(`Reading fixture: ${fixturePath}`);
const buffer = readFileSync(fixturePath);

console.log(`Parsing ${buffer.byteLength} bytes...`);
const status = parseRealtimeStatus(buffer.buffer);

console.log('--- Result ---');
console.log(`Timestamp: ${status.u} (${new Date(status.u * 1000).toISOString()})`);
console.log(`Entities: ${status.entities.length}`);
console.log(`Alerts: ${status.alerts.length}`);

if (status.entities.length > 0) {
    console.log('First 3 entities:', status.entities.slice(0, 3));
} else {
    console.log('No entities found. Is the fixture empty or outside service hours?');
}

if (status.alerts.length > 0) {
    console.log('First alert:', status.alerts[0]);
}

// Validation
if (!status.u) throw new Error('Missing timestamp');
if (!Array.isArray(status.entities)) throw new Error('Entities is not an array');
console.log('Test Passed!');
