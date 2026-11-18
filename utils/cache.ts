import { CachedItem } from '../types';

const CACHE_KEY = 'eduScanAICache';
const MAX_CACHE_SIZE = 10; // Store up to 10 recent items

export const getCachedItems = (): CachedItem[] => {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && item.id) : [];
    }
  } catch (error) {
    console.error('Failed to retrieve from cache:', error);
  }
  return [];
};

export const saveToCache = (newItem: CachedItem): void => {
  try {
    let items = getCachedItems();
    // Add new item to the beginning
    items.unshift(newItem);
    // Limit cache size
    if (items.length > MAX_CACHE_SIZE) {
      items = items.slice(0, MAX_CACHE_SIZE);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to save to cache:', error);
  }
};

export const clearCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
};

export const getCacheItemById = (id: string): CachedItem | undefined => {
    const items = getCachedItems();
    return items.find(item => item.id === id);
};
