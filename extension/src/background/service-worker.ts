import { getSearchRunStatus, pluginLogin, submitCandidates } from "../lib/api-client.js";
import { PluginApiError, type CandidateDraft, type RuntimeMessage, type SessionState } from "../lib/types.js";
import { MAX_CANDIDATES_PER_BATCH } from "../lib/config.js";
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
  submitted: number;
  accepted: number;
  runStatus?: string;
  stopped?: boolean; // 命中终态，插件应停止
  error?: { code: string; message: string };
}

// 分批提交，内置限流退避与终态检测。每批 ≤ MAX_CANDIDATES_PER_BATCH。
async function handleSubmit(
  searchRunId: string,
  candidates: CandidateDraft[],
  sourcePlatform: string,
): Promise<SubmitOutcome> {
  let accepted = 0;
  let lastStatus: string | undefined;
  const stamp = Date.now();

  for (let i = 0; i < candidates.length; i += MAX_CANDIDATES_PER_BATCH) {
    const chunk = candidates.slice(i, i + MAX_CANDIDATES_PER_BATCH);
    const batchId = `boss-${stamp}-${i / MAX_CANDIDATES_PER_BATCH}`;

    // 单批最多重试 3 次（仅对 RateLimited / InternalError 退避重试）
    let attempt = 0;
    for (;;) {
      try {
        const res = await submitCandidates(searchRunId, {
          batchId,
          sourcePlatform,
          candidates: chunk,
        });
        accepted += res.acceptedCount;
        lastStatus = res.status;
        break;
      } catch (error) {
        if (!(error instanceof PluginApiError)) {
          return { ok: false, submitted: candidates.length, accepted, error: { code: "InternalError", message: String(error) } };
        }
        if (TERMINAL_CODES.has(error.code)) {
          return { ok: false, submitted: candidates.length, accepted, runStatus: error.code, stopped: true, error: { code: error.code, message: error.message } };
        }
        if (error.code === "AuthError") {
          return { ok: false, submitted: candidates.length, accepted, stopped: true, error: { code: error.code, message: error.message } };
        }
        if ((error.code === "RateLimited" || error.code === "InternalError") && attempt < 3) {
          attempt += 1;
          const backoff = (error.retryAfterSeconds ?? 5 * attempt) * 1000;
          await sleep(backoff);
          continue;
        }
        return { ok: false, submitted: candidates.length, accepted, error: { code: error.code, message: error.message } };
      }
    }
  }

  return { ok: true, submitted: candidates.length, accepted, runStatus: lastStatus };
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

        case "SUBMIT_CANDIDATES": {
          const runId = await getActiveSearchRunId();
          if (!runId) {
            sendResponse({ ok: false, error: { code: "NoActiveRun", message: "未设置目标 SearchRun，请先在插件中填入 searchRunId。" } });
            break;
          }
          sendResponse(await handleSubmit(runId, message.candidates, message.sourcePlatform));
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
