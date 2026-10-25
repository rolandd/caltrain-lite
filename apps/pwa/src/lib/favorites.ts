// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

/**
 * Favorites management backed by localStorage.
 *
 * Stores an array of "originId-destId" strings.
 */

const KEY = 'transit-favorites';

export function getFavorites(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string');
  } catch {
    return [];
  }
}

/**
 * Drop favorites that reference stations no longer present in the schedule
 * (the parser prunes stations with zero trips, so a station can disappear
 * when a new schedule is published) and persist the pruned list.
 *
 * Returns the kept favorites.
 */
export function pruneFavorites(
  isValidPair: (origin: string, destination: string) => boolean,
): string[] {
  if (typeof localStorage === 'undefined') return [];
  const favorites = getFavorites();
  const kept = favorites.filter((pair) => {
    const [origin, destination] = pair.split('-');
    return origin !== undefined && destination !== undefined && isValidPair(origin, destination);
  });
  if (kept.length !== favorites.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(kept));
    } catch (err) {
      // Storage can reject (quota, privacy mode); the in-memory prune still
      // applies, only persistence is lost.
      console.warn('Failed to persist pruned favorites:', err);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('transit:favorite-toggled', {
          detail: { hasFavorites: kept.length > 0 },
        }),
      );
    }
  }
  return kept;
}

export function toggleFavorite(origin: string, destination: string): boolean {
  if (typeof localStorage === 'undefined') return false;

  const pair = `${origin}-${destination}`;
  const favorites = getFavorites();
  const index = favorites.indexOf(pair);

  let newFavorites: string[];
  let isNowFavorite: boolean;

  if (index >= 0) {
    // Remove
    newFavorites = favorites.filter((f) => f !== pair);
    isNowFavorite = false;
  } else {
    // Add (limit to 10 for sanity)
    newFavorites = [pair, ...favorites].slice(0, 10);
    isNowFavorite = true;
  }

  localStorage.setItem(KEY, JSON.stringify(newFavorites));

  // Dispatch event so other components (like InstallPrompt) can react
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('transit:favorite-toggled', {
        detail: { hasFavorites: newFavorites.length > 0 },
      }),
    );
  }

  return isNowFavorite;
}
