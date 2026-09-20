import { BalanceResult } from "../class/api";

const CACHE_KEY = "relay_panel_balance_cache";
/** 缓存条数上限，防止无限增长 */
export const MAX_CACHE_ENTRIES = 50;

export interface BalanceCacheEntry {
  data: BalanceResult;
  /** ISO 时间字符串 */
  updatedAt: string;
}

export function loadBalanceCache(): Record<string, BalanceCacheEntry> {
  try {
    const raw = Storage.get<Record<string, BalanceCacheEntry>>(CACHE_KEY);
    if (raw && typeof raw === "object") return raw;
    return {};
  } catch {
    return {};
  }
}

export function getCachedBalance(id: string): BalanceCacheEntry | null {
  const cache = loadBalanceCache();
  return cache[id] ?? null;
}

export function saveBalanceCache(id: string, data: BalanceResult): void {
  try {
    const cache = loadBalanceCache();
    cache[id] = { data, updatedAt: new Date().toISOString() };
    // 超限时删除最早更新的条目（粗略 LRU）
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries.sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? -1 : 1));
      const overflow = entries.length - MAX_CACHE_ENTRIES;
      for (let i = 0; i < overflow; i++) {
        delete cache[entries[i][0]];
      }
    }
    Storage.set(CACHE_KEY, cache);
  } catch {}
}

export function clearBalanceCache(): void {
  try {
    Storage.remove(CACHE_KEY);
  } catch {}
}

export function balanceCacheCount(): number {
  return Object.keys(loadBalanceCache()).length;
}
