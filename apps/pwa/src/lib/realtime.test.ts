// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import {
  findAlertForTrain,
  getUnprefixedTrainNumber,
  isRealtimeApplicable,
  lookupByTrainNumber,
  type RealtimeStatusWithMetadata,
} from './realtime';
import { getTransitDateStr } from './time';
import type { ServiceAlert } from '@packages/types/schema';

describe('isRealtimeApplicable', () => {
  const mockRealtime: RealtimeStatusWithMetadata = {
    t: 1789692000,
    byTrip: {},
    a: [],
    initialAge: 5000,
    fetchedAt: Date.now(),
  };

  it('returns false when realtime is null or undefined', () => {
    expect(isRealtimeApplicable('2026-09-17', null)).toBe(false);
    expect(isRealtimeApplicable('2026-09-17', undefined)).toBe(false);
  });

  it('returns false when dateStr is null, undefined, or empty', () => {
    expect(isRealtimeApplicable(null, mockRealtime)).toBe(false);
    expect(isRealtimeApplicable(undefined, mockRealtime)).toBe(false);
    expect(isRealtimeApplicable('', mockRealtime)).toBe(false);
  });

  it('returns false when dateStr is yesterday or a different day', () => {
    // Current transit date: 2026-09-17, selected date: 2026-09-16
    expect(isRealtimeApplicable('2026-09-16', mockRealtime, '2026-09-17')).toBe(false);
    expect(isRealtimeApplicable('2026-09-18', mockRealtime, '2026-09-17')).toBe(false);
  });

  it('returns true when dateStr matches the current transit day', () => {
    expect(isRealtimeApplicable('2026-09-17', mockRealtime, '2026-09-17')).toBe(true);
  });

  it('defaults todayStr to getTransitDateStr()', () => {
    const today = getTransitDateStr();
    expect(isRealtimeApplicable(today, mockRealtime)).toBe(true);
    expect(isRealtimeApplicable('1999-01-01', mockRealtime)).toBe(false);
  });
});

describe('getUnprefixedTrainNumber', () => {
  it('strips leading M from modified-schedule numeric train numbers', () => {
    expect(getUnprefixedTrainNumber('M162')).toBe('162');
    expect(getUnprefixedTrainNumber('M101')).toBe('101');
  });

  it('returns undefined for regular train numbers and non-matching strings', () => {
    expect(getUnprefixedTrainNumber('162')).toBeUndefined();
    expect(getUnprefixedTrainNumber('819')).toBeUndefined();
    expect(getUnprefixedTrainNumber('m162')).toBeUndefined();
    expect(getUnprefixedTrainNumber('M')).toBeUndefined();
    expect(getUnprefixedTrainNumber('Main')).toBeUndefined();
    expect(getUnprefixedTrainNumber('')).toBeUndefined();
  });
});

describe('lookupByTrainNumber', () => {
  it('returns exact match when present', () => {
    const map = { '162': { d: 60 }, M162: { d: 120 } };
    expect(lookupByTrainNumber(map, '162')).toEqual({ d: 60 });
    expect(lookupByTrainNumber(map, 'M162')).toEqual({ d: 120 });
  });

  it('falls back to unprefixed train number when M-prefixed lookup misses', () => {
    const map = { '162': { d: 180, p: { la: 37.4435, lo: -122.165 } } };
    expect(lookupByTrainNumber(map, 'M162')).toEqual({
      d: 180,
      p: { la: 37.4435, lo: -122.165 },
    });
  });

  it('returns undefined when neither exact nor unprefixed key exists', () => {
    const map = { '163': { d: 0 } };
    expect(lookupByTrainNumber(map, 'M162')).toBeUndefined();
    expect(lookupByTrainNumber(map, '162')).toBeUndefined();
  });

  it('handles null/undefined records and ignores inherited prototype keys', () => {
    expect(lookupByTrainNumber(null, 'M162')).toBeUndefined();
    expect(lookupByTrainNumber(undefined, '162')).toBeUndefined();
    expect(lookupByTrainNumber({}, 'toString')).toBeUndefined();
    expect(lookupByTrainNumber({}, 'constructor')).toBeUndefined();
  });
});

describe('findAlertForTrain', () => {
  const alertUnprefixed: ServiceAlert = {
    h: 'Train 162 is delayed',
    d: 'Mechanical issue',
    tr: ['162'],
  };
  const alertPrefixed: ServiceAlert = {
    h: 'Train M162 is delayed',
    d: 'Modified schedule delay',
    tr: ['M162'],
  };

  it('matches exact train number', () => {
    expect(findAlertForTrain([alertUnprefixed], '162')).toBe(alertUnprefixed);
  });

  it('falls back to unprefixed train number for M-prefixed trains', () => {
    expect(findAlertForTrain([alertUnprefixed], 'M162')).toBe(alertUnprefixed);
  });

  it('prefers exact match over unprefixed fallback', () => {
    expect(findAlertForTrain([alertUnprefixed, alertPrefixed], 'M162')).toBe(alertPrefixed);
  });

  it('returns undefined when alerts are empty, missing, or unrelated', () => {
    expect(findAlertForTrain(undefined, 'M162')).toBeUndefined();
    expect(findAlertForTrain([], 'M162')).toBeUndefined();
    expect(findAlertForTrain([{ h: 'Elevator out', d: '' }], 'M162')).toBeUndefined();
    expect(findAlertForTrain([alertUnprefixed], 'M163')).toBeUndefined();
  });
});
