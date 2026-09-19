// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect } from 'vitest';
import { isRealtimeApplicable, type RealtimeStatusWithMetadata } from './realtime';
import { getTransitDateStr } from './time';

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
