import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const manifestPath = "dist/.vite/manifest.json";
if (!existsSync(manifestPath)) {
  console.error("Bundle report unavailable: expected Vite manifest at", manifestPath);
  process.exitCode = 1;
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const chunks = Object.entries(manifest).filter(([, entry]) => entry.file?.endsWith(".js"));
  const sorted = chunks.map(([name, entry]) => ({
    name, file: entry.file, bytes: statSync(join("dist", entry.file)).size,
    entry: Boolean(entry.isEntry), dynamicEntry: Boolean(entry.isDynamicEntry),
    imports: entry.imports || [], dynamicImports: entry.dynamicImports || [],
  })).sort((a, b) => b.bytes - a.bytes);
  const byName = new Map(chunks);
  const visited = new Set();
  const initial = [];
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const entry = byName.get(name);
    if (!entry || !entry.file?.endsWith(".js")) return;
    initial.push(entry.file);
    for (const importName of entry.imports || []) visit(importName);
  }
  const entries = chunks.filter(([, value]) => value.isEntry);
  for (const [name] of entries) visit(name);
  const initialBytes = [...new Set(initial)].reduce((sum, filename) => sum + statSync(join("dist",filename)).size, 0);
  const totalBytes = sorted.reduce((sum,item) => sum + item.bytes, 0);
  const result = {
    generatedAt: new Date().toISOString(),
    initialJavaScriptBytes: initialBytes,
    totalJavaScriptBytes: totalBytes,
    javascriptChunks: sorted.length,
    largeChunks: sorted.filter(item=>item.bytes>500_000).map(item=>({file:item.file,bytes:item.bytes})),
    topChunks: sorted.slice(0,12).map(({file,bytes,entry,dynamicEntry})=>({file,bytes,entry,dynamicEntry})),
  };
  writeFileSync("dist/bundle-report.json", JSON.stringify(result,null,2));
  const format = bytes => `${(bytes/1024).toFixed(1)} KiB`;
  console.log("\nArlovi bundle report (minified, before gzip):");
  console.log("  Initial import graph:", format(initialBytes));
  console.log("  All JavaScript chunks:", format(totalBytes), "across",sorted.length,"chunks");
  for (const item of sorted.slice(0,8)) {
    console.log("  ",format(item.bytes).padStart(11),item.entry?"[entry]":item.dynamicEntry?"[lazy] ":"       ",item.file);
  }
  if (result.largeChunks.length) console.warn("  Warning:", result.largeChunks.length, "chunks exceed 500 KiB; review dist/bundle-report.json.");
}
