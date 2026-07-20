import { DEFAULT_API_BASE, STORAGE_KEYS } from "./config.js";

// chrome.storage.local 的薄封装。token 只存在扩展本地（docs/30 §2）。

export async function getToken(): Promise<string | null> {
  const v = await chrome.storage.local.get(STORAGE_KEYS.token);
  return (v[STORAGE_KEYS.token] as string | undefined) ?? null;
}

export async function getTokenExpiresAt(): Promise<number | null> {
  const v = await chrome.storage.local.get(STORAGE_KEYS.tokenExpiresAt);
  return (v[STORAGE_KEYS.tokenExpiresAt] as number | undefined) ?? null;
}

export async function saveSession(token: string, expiresInSeconds: number, email: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.token]: token,
    [STORAGE_KEYS.tokenExpiresAt]: Date.now() + expiresInSeconds * 1000,
    [STORAGE_KEYS.email]: email,
  });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.token,
    STORAGE_KEYS.tokenExpiresAt,
    STORAGE_KEYS.email,
  ]);
}

export async function getEmail(): Promise<string | null> {
  const v = await chrome.storage.local.get(STORAGE_KEYS.email);
  return (v[STORAGE_KEYS.email] as string | undefined) ?? null;
}

export async function getApiBase(): Promise<string> {
  const v = await chrome.storage.local.get(STORAGE_KEYS.apiBase);
  return (v[STORAGE_KEYS.apiBase] as string | undefined) ?? DEFAULT_API_BASE;
}

export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBase]: base.replace(/\/+$/, "") });
}

export async function getActiveSearchRunId(): Promise<string | null> {
  const v = await chrome.storage.local.get(STORAGE_KEYS.activeSearchRunId);
  return (v[STORAGE_KEYS.activeSearchRunId] as string | undefined) ?? null;
}

export async function setActiveSearchRunId(id: string | null): Promise<void> {
  if (id) {
    await chrome.storage.local.set({ [STORAGE_KEYS.activeSearchRunId]: id });
  } else {
    await chrome.storage.local.remove(STORAGE_KEYS.activeSearchRunId);
  }
}

export function isTokenValid(expiresAt: number | null): boolean {
  // 提前 60s 视为过期，避免临界请求失败
  return expiresAt !== null && expiresAt - 60_000 > Date.now();
}
