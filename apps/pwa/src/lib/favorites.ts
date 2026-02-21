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
