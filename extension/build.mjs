import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, "dist");
const watch = process.argv.includes("--watch");

const entryPoints = {
  "service-worker": join(root, "src/background/service-worker.ts"),
  hook: join(root, "src/content/hook.ts"),
  content: join(root, "src/content/boss.ts"),
  popup: join(root, "src/popup/popup.ts"),
};

const shared = {
  bundle: true,
  format: "esm",
  target: "chrome110",
  sourcemap: true,
  logLevel: "info",
};

function copyStatic() {
  mkdirSync(outdir, { recursive: true });
  // 静态资源：manifest、popup 页面、内容脚本样式
  cpSync(join(root, "manifest.json"), join(outdir, "manifest.json"));
  cpSync(join(root, "src/popup/popup.html"), join(outdir, "popup.html"));
  cpSync(join(root, "src/content/panel.css"), join(outdir, "panel.css"));
}

async function run() {
  rmSync(outdir, { recursive: true, force: true });
  copyStatic();

  const options = { ...shared, entryPoints, outdir };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("[build] watching for changes…");
  } else {
    await build(options);
    console.log("[build] done →", outdir);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
