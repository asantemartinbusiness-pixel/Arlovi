#!/usr/bin/env node
/**
 * Source-of-truth inventory for app-owned dialogs, drawers and inspectors.
 *
 * This is a static audit, not a claim that a rendered flow was tested. It
 * deliberately reports bespoke declarations separately from the approved
 * screen catalogue (which can include historical or aspirational entries).
 *
 * Run: npm run audit:overlays
 *      npm run audit:overlays -- --json docs/implementation/native-overlay-inventory.json
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { mkdirSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const appRoot = join(root, "src", "applications");
const catalog = JSON.parse(readFileSync(join(root, "src/generated/catalog.json"), "utf8"));
const expected = new Set(catalog.applications.map(item => item.code));
const rows = [];
const byApp = [];
const issues = [];

for (const dir of readdirSync(appRoot, { withFileTypes: true }).filter(item => item.isDirectory())) {
  const file = join(appRoot, dir.name, "index.tsx");
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const appMatch = text.match(/\bcode:\s*"([A-Z]+)"/);
  if (!appMatch || !expected.has(appMatch[1])) continue;
  const app = appMatch[1];
  const re = /\{\s*id:\s*["']([^"']+)["']\s*,\s*kind:\s*["'](modal|drawer)["']/g;
  const matches = [...text.matchAll(re)];
  const screens = [...text.matchAll(/["'](ARL-[A-Z]+-[0-9]{3})["']\s*:\s*\{/g)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const lastScreen = screens.filter(s => s.index < match.index).at(-1);
    const next = matches[i + 1]?.index ?? text.length;
    const block = text.slice(match.index, Math.min(next, match.index + 1800));
    const renderAt = block.search(/\brender\s*:/);
    const header = renderAt >= 0 ? block.slice(0, renderAt) : block.slice(0, 500);
    const line = text.slice(0, match.index).split("\n").length;
    rows.push({
      app, screen: lastScreen?.[1] ?? null,
      id: match[1], kind: match[2],
      source: `src/applications/${dir.name}/index.tsx:${line}`,
      explicitTitle: /\btitle\s*:/.test(header),
      description: /\bdescription\s*:/.test(header),
      taskGuidance: /\bpresentation\s*:/.test(header),
      capability: /\bcapability\s*:/.test(header),
      footer: /\bfooter\s*:/.test(block),
      render: renderAt >= 0,
    });
  }
  byApp.push({
    app, directory: dir.name, declared: matches.length,
    modal: matches.filter(m => m[2] === "modal").length,
    drawer: matches.filter(m => m[2] === "drawer").length,
    inspectors: [...text.matchAll(/\binspector\s*:\s*\(/g)].length,
  });
}
const actualApps = new Set(byApp.map(row => row.app));
for (const code of expected) if (!actualApps.has(code)) issues.push(`Missing registered application module: ${code}`);
for (const row of rows) {
  if (!row.render) issues.push(`No inline renderer detected (inspect manually): ${row.source} ${row.id}`);
  if (!row.screen) issues.push(`No owning screen detected: ${row.source} ${row.id}`);
}
const report = {
  generatedFrom: ["src/generated/catalog.json", "src/applications/*/index.tsx"],
  coverageNote: "Static declarations, not a runtime or usability pass. Some overlays are assembled in helpers.",
  applications: byApp.length,
  approvedScreens: catalog.counts.screens,
  approvedOverlayEntries: catalog.counts.overlays,
  sourceOverlayDeclarations: rows.length,
  appSummary: byApp.sort((a,b) => a.app.localeCompare(b.app)),
  issues,
  overlays: rows,
};
const jsonIndex = process.argv.indexOf("--json");
if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
  const file = resolve(root, process.argv[jsonIndex + 1]);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`Overlay audit saved: ${file}`);
}
console.log(`Native apps: ${report.applications}; approved screens: ${report.approvedScreens}; approved overlay entries: ${report.approvedOverlayEntries}`);
console.log(`Source modal/drawer declarations: ${report.sourceOverlayDeclarations}`);
console.table(report.appSummary);
console.log(`Static inspection issues: ${issues.length}`);
if (issues.length) console.log(issues.slice(0, 30).join("\n"));
