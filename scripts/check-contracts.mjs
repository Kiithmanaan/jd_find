import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const failures = [];

function assertIncludes(source, expected, description) {
  if (!source.includes(expected)) {
    failures.push(`${description}: missing ${expected}`);
  }
}

const types = read("src/domain/types.ts");
const openapi = read("docs/31-technical-openapi.yaml");
const architecture = read("docs/10-technical-architecture.md");
const schemas = read("src/api/schemas.ts");
const readme = read("README.md");
const developmentGuide = read("docs/40-engineering-development-guide.md");
const codeTodo = read("docs/50-todo.md");

const statusMatch = types.match(/export type SearchRunStatus =([\s\S]*?);/);
if (!statusMatch) {
  failures.push("SearchRunStatus type was not found.");
} else {
  const statuses = Array.from(statusMatch[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  for (const status of statuses) {
    assertIncludes(openapi, status, `OpenAPI SearchRunStatus should include Domain status ${status}`);
    assertIncludes(architecture, `| ${status} |`, `Architecture status mapping should include Domain status ${status}`);
  }
}

for (const expected of ["minimum: 10", "maximum: 500", "default: 200"]) {
  assertIncludes(openapi, expected, `OpenAPI targetResultCount contract should include ${expected}`);
}
for (const expected of [".min(10)", ".max(500)", ".default(200)"]) {
  assertIncludes(schemas, expected, `Zod targetResultCount contract should include ${expected}`);
}

assertIncludes(readme, "docs/50-todo.md", "README architecture docs should include TODO document");
assertIncludes(developmentGuide, "docs/50-todo.md", "Development guide should mention TODO document");

for (const expected of [
  "AI Assessment",
  "插件聚合",
  "Source Adapter",
  "SourceLead",
  "软性条件",
  "限流",
  "前端",
]) {
  assertIncludes(codeTodo, expected, `Code TODO document should include task keyword ${expected}`);
}

if (failures.length > 0) {
  console.error("Contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Contract check passed.");
