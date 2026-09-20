const DISPLAY_KEY = "relay_panel_display_settings";

export interface AppDisplaySettings {
  /** 小组件自动刷新间隔（分钟），5-360 */
  reloadMinutes: number;
}

export const APP_VERSION = "1.2.0";

const DEFAULT: AppDisplaySettings = { reloadMinutes: 30 };

export const RELOAD_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 5, label: "5 分钟" },
  { minutes: 15, label: "15 分钟" },
  { minutes: 30, label: "30 分钟" },
  { minutes: 60, label: "1 小时" },
  { minutes: 120, label: "2 小时" },
  { minutes: 360, label: "6 小时" },
];

function clampMinutes(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 5) return DEFAULT.reloadMinutes;
  return Math.min(360, n);
}

export function getAppDisplaySettings(): AppDisplaySettings {
  try {
    const value = Storage.get<Partial<AppDisplaySettings>>(DISPLAY_KEY);
    return { reloadMinutes: clampMinutes(value?.reloadMinutes) };
  } catch {
    return { ...DEFAULT };
  }
}

export function setAppReloadMinutes(minutes: number): AppDisplaySettings {
  const next = { reloadMinutes: clampMinutes(minutes) };
  try {
    Storage.set(DISPLAY_KEY, next);
  } catch {}
  return next;
}