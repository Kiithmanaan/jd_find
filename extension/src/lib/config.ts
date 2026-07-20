// API 基址。默认指向测试服务器；改这里即可切换环境。
// 注意：改动后需同步 manifest.json 的 host_permissions，否则 fetch 会被 CORS/权限拦截。
export const DEFAULT_API_BASE = "http://47.116.191.196";

// 存储键
export const STORAGE_KEYS = {
  token: "jdfind.token",
  tokenExpiresAt: "jdfind.tokenExpiresAt",
  email: "jdfind.email",
  apiBase: "jdfind.apiBase",
  activeSearchRunId: "jdfind.activeSearchRunId",
} as const;

// 轮询与限流退避（docs/30 §7）
export const POLL_INTERVAL_MS = 10_000;
export const RATE_LIMITED_POLL_INTERVAL_MS = 45_000;

// 单批提交上限：主工程缓冲满 20 条立即评估，这里一批不超过 20 条，避免一次请求过大。
export const MAX_CANDIDATES_PER_BATCH = 20;
