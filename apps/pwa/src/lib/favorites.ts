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
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function isFavorite(origin: string, destination: string): boolean {
  const favorites = getFavorites();
  const pair = `${origin}-${destination}`;
  return favorites.includes(pair);
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
  return isNowFavorite;
}
