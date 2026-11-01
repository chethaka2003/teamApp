import { ScheduleEventItem } from '../types';

const SCHEDULE_CACHE_KEY = 'team_app_offline_schedule_v1';

const memoryCache: Record<string, string> = {};

async function writeStorageItem(key: string, value: string): Promise<void> {
  memoryCache[key] = value;
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
        key,
        value
      );
      return;
    }
  } catch {
    // Ignore web storage errors
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    if (SecureStore?.setItemAsync) {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    // Fallback remains in memoryCache
  }
}

async function readStorageItem(key: string): Promise<string | null> {
  if (memoryCache[key]) {
    return memoryCache[key];
  }

  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const val = (
        globalThis as unknown as { localStorage: Storage }
      ).localStorage.getItem(key);
      if (val) return val;
    }
  } catch {
    // Ignore web storage errors
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    if (SecureStore?.getItemAsync) {
      return await SecureStore.getItemAsync(key);
    }
  } catch {
    // Fallback
  }

  return null;
}

export interface CachedSchedulePayload {
  updatedAt: string;
  events: ScheduleEventItem[];
}

export async function saveScheduleToOfflineCache(
  events: ScheduleEventItem[]
): Promise<CachedSchedulePayload> {
  const payload: CachedSchedulePayload = {
    updatedAt: new Date().toISOString(),
    events,
  };
  await writeStorageItem(SCHEDULE_CACHE_KEY, JSON.stringify(payload));
  return payload;
}

export async function loadScheduleFromOfflineCache(): Promise<CachedSchedulePayload | null> {
  const raw = await readStorageItem(SCHEDULE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedSchedulePayload;
  } catch {
    return null;
  }
}

export function extractInviteCodeFromQrPayload(rawQrData: string): string {
  const trimmed = rawQrData.trim();
  const match = trimmed.match(/[?&]code=([A-Za-z0-9]{4,16})/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        invite_code?: string;
        code?: string;
      };
      const code = parsed.invite_code ?? parsed.code;
      if (code) return code.trim().toUpperCase();
    } catch {
      // Fall through to raw code
    }
  }
  return trimmed.toUpperCase();
}

export function extractUserIdFromQrPayload(rawQrData: string): string {
  const trimmed = rawQrData.trim();
  const match = trimmed.match(/[?&]id=([0-9a-fA-F-]{32,36})/i);
  if (match && match[1]) {
    return match[1];
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        user_id?: string;
        id?: string;
      };
      const id = parsed.user_id ?? parsed.id;
      if (id) return id.trim();
    } catch {
      // Fall through
    }
  }
  return trimmed;
}

export function formatOrdinalRank(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${rank}th`;
  }
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}
