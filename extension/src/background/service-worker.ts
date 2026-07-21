import { getSearchRunStatus, pluginLogin, submitCandidates, submitRawCandidates } from "../lib/api-client.js";
import {
  PluginApiError,
  type CandidateDraft,
  type RawPayload,
  type RuntimeMessage,
  type SessionState,
} from "../lib/types.js";
import { CAPTURE_VERSION, MAX_CANDIDATES_PER_BATCH, MAX_PAYLOADS_PER_BATCH } from "../lib/config.js";
import {
  clearSession,
  getActiveSearchRunId,
  getEmail,
  getTokenExpiresAt,
  isTokenValid,
  saveSession,
  setActiveSearchRunId,
} from "../lib/storage.js";

// 终态错误码：命中后应停止当前批次（docs/30 §8）
const TERMINAL_CODES = new Set(["SearchRunCompleted", "SearchRunCancelled", "SearchRunFailed"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildSession(): Promise<SessionState> {
  const [email, expiresAt, activeSearchRunId] = await Promise.all([
    getEmail(),
    getTokenExpiresAt(),
    getActiveSearchRunId(),
  ]);
  return {
    email,
    loggedIn: isTokenValid(expiresAt),
    tokenExpiresAt: expiresAt,
    activeSearchRunId,
  };
}

interface SubmitOutcome {
  ok: boolean;
  submitted: number; // §4b：payload 数；fallback：候选人数
  accepted: number;
  draftsParsed?: number; // §4b 服务端解析出的候选人数
  rejected?: number;
  mappingVersion?: string;
  usedFallback?: boolean;
  runStatus?: string;
  stopped?: boolean; // 命中终态，插件应停止
  error?: { code: string; message: string };
}

// 通用分批重试执行器：仅对 RateLimited/InternalError 退避重试，命中终态/AuthError 立即停止。
async function runBatches<T>(
  count: number,
  submitOne: (batchIndex: number) => Promise<T>,
  onResult: (res: T) => void,
): Promise<{ ok: boolean; stopped?: boolean; runStatusFromError?: string; error?: PluginApiError }> {
  for (let batchIndex = 0; batchIndex < count; batchIndex += 1) {
    let attempt = 0;
    for (;;) {
      try {
        onResult(await submitOne(batchIndex));
        break;
      } catch (error) {
        if (!(error instanceof PluginApiError)) {
          return { ok: false, error: new PluginApiError("InternalError", String(error), 0) };
        }
        if (TERMINAL_CODES.has(error.code)) {
          return { ok: false, stopped: true, runStatusFromError: error.code, error };
        }
        if (error.code === "AuthError") return { ok: false, stopped: true, error };
        if ((error.code === "RateLimited" || error.code === "InternalError") && attempt < 3) {
          attempt += 1;
          await sleep((error.retryAfterSeconds ?? 5 * attempt) * 1000);
          continue;
        }
        return { ok: false, error };
      }
    }
  }
  return { ok: true };
}

// 主路径：分批提交原始载荷（每批 ≤ MAX_PAYLOADS_PER_BATCH）。§4b 返回 404/5xx 时回退客户端解析（docs/30 §4d）。
async function handleSubmitRaw(
  searchRunId: string,
  payloads: RawPayload[],
  sourcePlatform: string,
  fallbackCandidates: CandidateDraft[],
): Promise<SubmitOutcome> {
  const stamp = Date.now();
  let accepted = 0;
  let draftsParsed = 0;
  let rejected = 0;
  let mappingVersion: string | undefined;
  let lastStatus: string | undefined;

  const batchCount = Math.ceil(payloads.length / MAX_PAYLOADS_PER_BATCH) || 1;
  const outcome = await runBatches(
    batchCount,
    (i) =>
      submitRawCandidates(searchRunId, {
        batchId: `raw-boss-${stamp}-${i}`,
        sourcePlatform,
        captureVersion: CAPTURE_VERSION,
        payloads: payloads.slice(i * MAX_PAYLOADS_PER_BATCH, (i + 1) * MAX_PAYLOADS_PER_BATCH),
      }),
    (res) => {
      accepted += res.acceptedCount;
      draftsParsed += res.parse.draftsParsed;
      rejected += res.parse.rejected;
      mappingVersion = res.parse.mappingVersion;
      lastStatus = res.status;
    },
  );

  if (outcome.ok) {
    return { ok: true, submitted: payloads.length, accepted, draftsParsed, rejected, mappingVersion, runStatus: lastStatus };
  }

  // §4d：仅当 §4b 返回 404/5xx 时，客户端解析兜底
  const err = outcome.error;
  const shouldFallback =
    !outcome.stopped &&
    err !== undefined &&
    (err.httpStatus === 404 || err.httpStatus >= 500) &&
    fallbackCandidates.length > 0;
  if (shouldFallback) {
    const fb = await handleSubmitCandidates(searchRunId, fallbackCandidates, sourcePlatform);
    return { ...fb, usedFallback: true };
  }

  return {
    ok: false,
    submitted: payloads.length,
    accepted,
    draftsParsed,
    rejected,
    mappingVersion,
    stopped: outcome.stopped,
    runStatus: outcome.runStatusFromError,
    error: err ? { code: err.code, message: err.message } : undefined,
  };
}

// 兜底路径：客户端已解析候选人，走 §4 /candidates。
async function handleSubmitCandidates(
  searchRunId: string,
  candidates: CandidateDraft[],
  sourcePlatform: string,
): Promise<SubmitOutcome> {
  const stamp = Date.now();
  let accepted = 0;
  let lastStatus: string | undefined;

  const batchCount = Math.ceil(candidates.length / MAX_CANDIDATES_PER_BATCH) || 1;
  const outcome = await runBatches(
    batchCount,
    (i) =>
      submitCandidates(searchRunId, {
        batchId: `boss-fb-${stamp}-${i}`,
        sourcePlatform,
        candidates: candidates.slice(i * MAX_CANDIDATES_PER_BATCH, (i + 1) * MAX_CANDIDATES_PER_BATCH),
      }),
    (res) => {
      accepted += res.acceptedCount;
      lastStatus = res.status;
    },
  );

  const err = outcome.error;
  return {
    ok: outcome.ok,
    submitted: candidates.length,
    accepted,
    stopped: outcome.stopped,
    runStatus: outcome.ok ? lastStatus : outcome.runStatusFromError,
    error: err ? { code: err.code, message: err.message } : undefined,
  };
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "GET_SESSION":
          sendResponse({ ok: true, session: await buildSession() });
          break;

        case "LOGIN": {
          const res = await pluginLogin(message.email, message.password);
          await saveSession(res.token, res.expiresIn, message.email);
          sendResponse({ ok: true, session: await buildSession() });
          break;
        }

        case "LOGOUT":
          await clearSession();
          sendResponse({ ok: true, session: await buildSession() });
          break;

        case "SET_ACTIVE_RUN":
          await setActiveSearchRunId(message.searchRunId.trim() || null);
          sendResponse({ ok: true, session: await buildSession() });
          break;

        case "SUBMIT_RAW": {
          const runId = await getActiveSearchRunId();
          if (!runId) {
            sendResponse({ ok: false, error: { code: "NoActiveRun", message: "未设置目标 SearchRun，请先在插件中填入 searchRunId。" } });
            break;
          }
          sendResponse(
            await handleSubmitRaw(runId, message.payloads, message.sourcePlatform, message.fallbackCandidates),
          );
          break;
        }

        case "GET_RUN_STATUS": {
          // 走 plugin 专用状态端点 GET /api/plugin/search-runs/:id/status（docs/30 §7）。
          const runId = await getActiveSearchRunId();
          if (!runId) {
            sendResponse({ ok: false, error: { code: "NoActiveRun", message: "未设置目标 SearchRun。" } });
            break;
          }
          try {
            const status = await getSearchRunStatus(runId);
            sendResponse({ ok: true, status });
          } catch (error) {
            const code = error instanceof PluginApiError ? error.code : "InternalError";
            const message = error instanceof PluginApiError ? error.message : String(error);
            sendResponse({ ok: false, error: { code, message } });
          }
          break;
        }

        default:
          sendResponse({ ok: false, error: { code: "UnknownMessage", message: "未知消息类型。" } });
      }
    } catch (error) {
      const code = error instanceof PluginApiError ? error.code : "InternalError";
      const message = error instanceof PluginApiError ? error.message : String(error);
      sendResponse({ ok: false, error: { code, message } });
    }
  })();

  return true; // 异步响应
});
