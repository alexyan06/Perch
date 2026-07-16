import { build, context, type BuildOptions } from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });
copyFileSync("src/manifest.json", "dist/manifest.json");

const config: BuildOptions = {
  entryPoints: ["src/background.ts"],
  outfile: "dist/background.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log("[build] watching for changes…");
} else {
  await build(config);
}
