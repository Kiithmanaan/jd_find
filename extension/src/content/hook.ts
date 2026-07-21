// 运行在页面 MAIN world（manifest 声明 world:"MAIN", run_at:"document_start"）。
// 只做一件事：被动包裹 window.fetch 与 XMLHttpRequest，把 Boss 候选人相关的 JSON 响应
// 通过 CustomEvent 转发给隔离世界的 content 脚本。绝不修改请求或响应。
//
// 数据用字符串（JSON.stringify）承载，确保跨 world 稳定传递。

const EVENT_NAME = "jdfind:boss-json";

// 已知候选人接口白名单（收敛匹配）→ matched=exact，便于服务端区分并统计。
const EXACT_URL_PATTERNS = [
  /\/wapi\/zpgeek\/.*geek.*(list|rec|card)/i,
  /\/wapi\/zpgeek\/.*recommend/i,
];
// 宽松特征 → matched=heuristic，用于发现来源平台新上线接口。
const CANDIDATE_URL_PATTERNS = [
  /\/wapi\/zpgeek\//i,
  /recommend/i,
  /\/search\//i,
  /geek.*(list|detail|card)/i,
  /friend|relation|interest/i,
];

const MAX_BYTES = 2_000_000; // 单条响应体上限，避免转发超大 JSON

function classify(url: string): "exact" | "heuristic" | null {
  if (EXACT_URL_PATTERNS.some((re) => re.test(url))) return "exact";
  if (CANDIDATE_URL_PATTERNS.some((re) => re.test(url))) return "heuristic";
  return null;
}

function forward(url: string, text: string): void {
  if (!text || text.length > MAX_BYTES) return;
  const matched = classify(url);
  if (!matched) return;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return; // 非 JSON，忽略
  }
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: JSON.stringify({ url, matched, capturedAt: new Date().toISOString(), json }),
      }),
    );
  } catch {
    /* 忽略序列化失败 */
  }
}

function isCandidateUrl(url: string): boolean {
  return classify(url) !== null;
}

// ---- fetch ----
const originalFetch = window.fetch;
window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);
  try {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? response.url;
    if (url && isCandidateUrl(url)) {
      const ct = response.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        // clone 读取，不影响页面自身消费
        response
          .clone()
          .text()
          .then((t) => forward(url, t))
          .catch(() => {});
      }
    }
  } catch {
    /* 只读旁路，任何异常都不影响原请求 */
  }
  return response;
};

// ---- XMLHttpRequest ----
const OriginalXHR = window.XMLHttpRequest;
const openSym = Symbol("jdfindUrl");
interface TaggedXHR extends XMLHttpRequest {
  [openSym]?: string;
}
const originalOpen = OriginalXHR.prototype.open;
OriginalXHR.prototype.open = function patchedOpen(
  this: TaggedXHR,
  method: string,
  url: string | URL,
  ...rest: unknown[]
) {
  try {
    this[openSym] = typeof url === "string" ? url : url.toString();
  } catch {
    /* ignore */
  }
  // @ts-expect-error 透传原始参数
  return originalOpen.call(this, method, url, ...rest);
};

OriginalXHR.prototype.addEventListener; // 保持原型引用（no-op，防摇树）
const originalSend = OriginalXHR.prototype.send;
OriginalXHR.prototype.send = function patchedSend(this: TaggedXHR, ...sendArgs: unknown[]) {
  try {
    this.addEventListener("load", () => {
      try {
        const url = this[openSym] ?? "";
        if (url && isCandidateUrl(url) && typeof this.responseText === "string") {
          const ct = this.getResponseHeader("content-type") ?? "";
          if (ct.includes("json") || this.responseText.startsWith("{") || this.responseText.startsWith("[")) {
            forward(url, this.responseText);
          }
        }
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  // @ts-expect-error 透传原始参数
  return originalSend.apply(this, sendArgs);
};
