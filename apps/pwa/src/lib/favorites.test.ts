// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect, beforeEach } from 'vitest';
import { getFavorites, pruneFavorites, toggleFavorite } from './favorites';

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

  describe('pruneFavorites', () => {
    it('drops favorites referencing stations removed from the schedule and persists the prune', () => {
      toggleFavorite('sf', 'sj_diridon');
      toggleFavorite('stanford', 'sj_diridon');
      toggleFavorite('pa', 'gilroy');

      const kept = pruneFavorites((o, d) => o !== 'stanford' && d !== 'stanford');

      // toggleFavorite prepends, so the surviving order is pa-gilroy first
      expect(kept).toEqual(['pa-gilroy', 'sf-sj_diridon']);
      expect(getFavorites()).toEqual(['pa-gilroy', 'sf-sj_diridon']);
    });

    it('leaves storage untouched when every favorite is still valid', () => {
      toggleFavorite('sf', 'sj_diridon');
      const before = localStorage.getItem('transit-favorites');

      const kept = pruneFavorites(() => true);

      expect(kept).toEqual(['sf-sj_diridon']);
      expect(localStorage.getItem('transit-favorites')).toBe(before);
    });

    it('still returns kept favorites when persisting throws', () => {
      toggleFavorite('sf', 'sj_diridon');
      toggleFavorite('stanford', 'sj_diridon');

      const realSetItem = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error('QuotaExceededError');
      };
      let kept: string[];
      try {
        kept = pruneFavorites((o, d) => o !== 'stanford' && d !== 'stanford');
      } finally {
        localStorage.setItem = realSetItem;
      }

      // The in-memory prune result is returned even though persistence failed
      expect(kept).toEqual(['sf-sj_diridon']);
      // Storage keeps the old (unpruned) list
      expect(getFavorites()).toEqual(['stanford-sj_diridon', 'sf-sj_diridon']);
    });

    it('keeps favorites whose stations are still valid on either end', () => {
      toggleFavorite('stanford', 'sf');
      toggleFavorite('sf', 'stanford');

      const kept = pruneFavorites((o, d) => o !== 'stanford' && d !== 'stanford');

      expect(kept).toEqual([]);
      expect(getFavorites()).toEqual([]);
    });
  });
});
