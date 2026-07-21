// 原始载荷遍历与候选人对象提取（docs/30 §4b）。纯函数，无副作用。
// 结构上限用于防止畸形载荷拖垮请求处理，不是数据过滤手段——超限即中止（RawPayloadLimitError → ValidationError）。

export interface StructuralLimits {
  maxDepth: number; // 嵌套深度
  maxGeeks: number; // 单次提取候选人对象数
  maxKeysPerObject: number; // 单对象键数
  maxStringLength: number; // 字符串长度
}

// docs/30 §4b 约束的默认值。可按真实平台载荷调整。
export const DEFAULT_STRUCTURAL_LIMITS: StructuralLimits = {
  maxDepth: 6,
  maxGeeks: 200,
  maxKeysPerObject: 64,
  maxStringLength: 512,
};

export class RawPayloadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RawPayloadLimitError";
  }
}

export interface CollectResult {
  geeks: Record<string, unknown>[];
  // 各字段名在候选人对象中的出现次数（keyCensus，用于发现来源平台改字段名）
  keyCensus: Record<string, number>;
}

// 遍历任意 JSON，用 isGeek 判定收集候选人对象，并在遍历中强制结构上限。
export function collectGeeks(
  root: unknown,
  isGeek: (obj: Record<string, unknown>) => boolean,
  limits: StructuralLimits = DEFAULT_STRUCTURAL_LIMITS,
): CollectResult {
  const geeks: Record<string, unknown>[] = [];
  const keyCensus: Record<string, number> = {};

  const walk = (node: unknown, depth: number): void => {
    if (depth > limits.maxDepth) {
      throw new RawPayloadLimitError(`嵌套深度超过 ${limits.maxDepth}`);
    }
    if (typeof node === "string") {
      if (node.length > limits.maxStringLength) {
        throw new RawPayloadLimitError(`字符串长度超过 ${limits.maxStringLength}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length > limits.maxKeysPerObject) {
        throw new RawPayloadLimitError(`单对象键数超过 ${limits.maxKeysPerObject}`);
      }
      if (isGeek(obj)) {
        if (geeks.length >= limits.maxGeeks) {
          throw new RawPayloadLimitError(`提取候选人对象超过 ${limits.maxGeeks}`);
        }
        geeks.push(obj);
        for (const key of keys) keyCensus[key] = (keyCensus[key] ?? 0) + 1;
      }
      for (const key of keys) walk(obj[key], depth + 1);
    }
  };

  walk(root, 0);
  return { geeks, keyCensus };
}
