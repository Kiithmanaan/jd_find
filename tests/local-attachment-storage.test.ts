import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAttachmentStorage } from "../src/infrastructure/local/local-attachment-storage.js";

test("本地附件使用 storageKey 且拒绝目录逃逸", async () => {
  const storage = new LocalAttachmentStorage(await mkdtemp(join(tmpdir(), "jd-attachment-")));
  const key = await storage.save("run-1", "candidate-1", "../resume.pdf", Buffer.from("resume"));
  assert.equal(key.includes(".."), false);
  assert.equal((await storage.read(key)).toString(), "resume");
  await assert.rejects(() => storage.read("../outside"), /invalid/);
});
