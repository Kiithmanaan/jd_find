import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnvFile } from "../src/config/load-env.js";

test("loadEnvFile ignores missing files", () => {
  assert.doesNotThrow(() => loadEnvFile("/tmp/non-existent-jd-search-env-file"));
});

test("loadEnvFile loads quoted and plain values without overriding existing env", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jd-search-env-"));
  const envPath = join(directory, ".env");
  const existingKey = "JD_SEARCH_EXISTING_ENV_TEST";
  const newKey = "JD_SEARCH_NEW_ENV_TEST";
  const quotedKey = "JD_SEARCH_QUOTED_ENV_TEST";

  process.env[existingKey] = "already-set";
  delete process.env[newKey];
  delete process.env[quotedKey];

  await writeFile(
    envPath,
    [
      "# comment",
      `${existingKey}=from-file`,
      `${newKey}=plain-value`,
      `${quotedKey}="quoted-value"`,
    ].join("\n"),
  );

  loadEnvFile(envPath);

  assert.equal(process.env[existingKey], "already-set");
  assert.equal(process.env[newKey], "plain-value");
  assert.equal(process.env[quotedKey], "quoted-value");

  delete process.env[existingKey];
  delete process.env[newKey];
  delete process.env[quotedKey];
  await rm(directory, { recursive: true, force: true });
});
