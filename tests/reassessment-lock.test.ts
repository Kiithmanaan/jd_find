import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryReassessmentLockRepository } from "../src/infrastructure/memory/in-memory-repositories.js";

test("同一岗位画像版本只允许一个重评估任务", async () => {
  const locks = new InMemoryReassessmentLockRepository();
  assert.equal(await locks.tryAcquire("job-1", "v2"), true);
  assert.equal(await locks.tryAcquire("job-1", "v2"), false);
  await locks.release("job-1", "v2");
  assert.equal(await locks.tryAcquire("job-1", "v2"), true);
});
