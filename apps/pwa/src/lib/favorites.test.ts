// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect, beforeEach } from 'vitest';
import { getFavorites, partitionFavorites, toggleFavorite } from './favorites';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

globalThis.localStorage = new MemoryStorage();

describe('favorites store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no favorites set', () => {
    expect(getFavorites()).toEqual([]);
  });

  it('toggles adding a favorite', () => {
    const isFav = toggleFavorite('st1', 'st2');
    expect(isFav).toBe(true);
    expect(getFavorites()).toEqual(['st1-st2']);
  });

  it('toggles removing an existing favorite', () => {
    toggleFavorite('st1', 'st2');
    const isFav = toggleFavorite('st1', 'st2');
    expect(isFav).toBe(false);
    expect(getFavorites()).toEqual([]);
  });

  it('limits favorites to 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      toggleFavorite(`st${i}`, `st${i + 1}`);
    }
    const favs = getFavorites();
    expect(favs.length).toBe(10);
    expect(favs[0]).toBe('st14-st15');
  });

  it('handles corrupt JSON in localStorage gracefully', () => {
    localStorage.setItem('transit-favorites', 'invalid-json');
    expect(getFavorites()).toEqual([]);
  });

  describe('partitionFavorites', () => {
    it('partitions favorites by whether both stations are in the schedule', () => {
      toggleFavorite('sf', 'sj_diridon');
      toggleFavorite('stanford', 'sj_diridon');
      toggleFavorite('pa', 'gilroy');

      const { available, unavailable } = partitionFavorites(
        getFavorites(),
        (id) => id !== 'stanford',
      );

      // toggleFavorite prepends, so the order is pa-gilroy first
      expect(available).toEqual(['pa-gilroy', 'sf-sj_diridon']);
      expect(unavailable).toEqual(['stanford-sj_diridon']);
    });

    it('never modifies storage, even when some favorites are unavailable', () => {
      toggleFavorite('sf', 'sj_diridon');
      toggleFavorite('stanford', 'sj_diridon');
      const before = localStorage.getItem('transit-favorites');

      const { available, unavailable } = partitionFavorites(
        getFavorites(),
        (id) => id !== 'stanford',
      );

      // A station missing from one schedule version (feed glitch, short-term
      // suspension) may reappear, so its favorites survive in storage.
      expect(available).toEqual(['sf-sj_diridon']);
      expect(unavailable).toEqual(['stanford-sj_diridon']);
      expect(localStorage.getItem('transit-favorites')).toBe(before);
      expect(getFavorites()).toEqual(['stanford-sj_diridon', 'sf-sj_diridon']);
    });

    it('counts a pair missing a station on either end as unavailable', () => {
      const { available, unavailable } = partitionFavorites(
        ['sf-stanford', 'stanford-sf', 'sf-sj_diridon'],
        (id) => id !== 'stanford',
      );

      expect(available).toEqual(['sf-sj_diridon']);
      expect(unavailable).toEqual(['sf-stanford', 'stanford-sf']);
    });

    it('counts malformed pairs as unavailable rather than dropping them', () => {
      const { available, unavailable } = partitionFavorites(['sf', 'sf-sj_diridon'], () => true);

      // Corrupt entries stay visible so the user can remove them.
      expect(available).toEqual(['sf-sj_diridon']);
      expect(unavailable).toEqual(['sf']);
    });

    it('returns empty partitions for empty input', () => {
      const { available, unavailable } = partitionFavorites([], () => true);

      expect(available).toEqual([]);
      expect(unavailable).toEqual([]);
    });
  });
});
