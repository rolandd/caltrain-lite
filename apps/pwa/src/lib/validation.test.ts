import { expect, test } from 'vitest';
import typia from 'typia';
import type { StaticSchedule, RealtimeStatus, ScheduleMeta } from '@packages/types/schema';

// Import the JSON snapshots
import scheduleData from './schedule-data.json';
import realtimeSnapshot from './realtime-snapshot.json';

test('validates valid schedule-data.json', () => {
  // Should not throw
  expect(() => typia.assert<StaticSchedule>(scheduleData)).not.toThrow();
});

test('validates valid realtime-snapshot.json', () => {
  // Should not throw
  expect(() => typia.assert<RealtimeStatus>(realtimeSnapshot)).not.toThrow();
});

test('rejects invalid schedule data', () => {
  const invalidSchedule = { ...scheduleData, t: 'not-an-array' };
  expect(() => typia.assert<StaticSchedule>(invalidSchedule)).toThrow();

  const missingMeta = { ...scheduleData };
  delete (missingMeta as any).m;
  expect(() => typia.assert<StaticSchedule>(missingMeta)).toThrow();
});

test('rejects invalid realtime data', () => {
  const invalidRealtime = { ...realtimeSnapshot, e: 123 };
  expect(() => typia.assert<RealtimeStatus>(invalidRealtime)).toThrow();
});

test('validates valid schedule meta', () => {
  // Create a minimal valid meta object based on the schema
  const validMeta: ScheduleMeta = {
    v: 'abcdef1234567890',
    e: 1,
    sv: 1,
    realtimeAge: 9999,
  };
  expect(() => typia.assert<ScheduleMeta>(validMeta)).not.toThrow();
});

test('rejects invalid schedule meta', () => {
  const invalidMeta = { v: 123 }; // v should be a string
  expect(() => typia.assert<ScheduleMeta>(invalidMeta)).toThrow();
});
