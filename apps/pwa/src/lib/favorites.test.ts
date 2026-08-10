// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import { describe, it, expect, beforeEach } from 'vitest';
import { getFavorites, toggleFavorite } from './favorites';

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
});
