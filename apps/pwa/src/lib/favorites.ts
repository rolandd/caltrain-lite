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
 * Partition favorites into pairs whose stations are all present in the
 * current schedule and pairs that reference at least one missing station.
 *
 * Pure: never touches storage. A station missing from one schedule version
 * (feed glitch, short-term service suspension) may reappear in the next
 * version, so its favorites stay in storage and re-activate automatically;
 * callers just filter unavailable pairs out of the UI. A permanently removed
 * station simply stays unavailable until the user removes the favorite.
 *
 * A pair that does not parse into two ids counts as unavailable (not
 * silently dropped) so corrupt entries stay visible and removable.
 */
export function partitionFavorites(
  favorites: string[],
  hasStation: (id: string) => boolean,
): { available: string[]; unavailable: string[] } {
  const available: string[] = [];
  const unavailable: string[] = [];
  for (const pair of favorites) {
    const [origin, destination] = pair.split('-');
    if (
      origin !== undefined &&
      destination !== undefined &&
      hasStation(origin) &&
      hasStation(destination)
    ) {
      available.push(pair);
    } else {
      unavailable.push(pair);
    }
  }
  return { available, unavailable };
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
