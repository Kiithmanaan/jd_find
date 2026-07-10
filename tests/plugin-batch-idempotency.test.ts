import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPluginCandidateBatchRepository } from "../src/infrastructure/memory/in-memory-repositories.js";

test("插件批次重复提交幂等且不同内容冲突", async () => {
  const repository = new InMemoryPluginCandidateBatchRepository();
  const batch = { searchRunId: "run-1", batchId: "batch-1", requestDigest: "a", candidateCount: 1, status: "processing" as const };
  assert.equal(await repository.claim(batch), "claimed");
  await repository.complete(batch.searchRunId, batch.batchId);
  assert.equal(await repository.claim(batch), "duplicate");
  assert.equal(await repository.claim({ ...batch, requestDigest: "b" }), "conflict");
});
