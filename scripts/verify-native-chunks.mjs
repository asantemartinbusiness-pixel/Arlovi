import { readFileSync, existsSync } from "node:fs";

const registry = readFileSync("src/applications/index.ts","utf8");
const groups = {
  Workplace:["inbox","admin","asset"],
  Intelligence:["ai","brain","team","mission"],
  Automation:["auto","analytics"],
  "Finance and CRM":["fin","crm"],
  "People and operations":["hr","project","comms","care","legal"],
  Growth:["market","commerce","book","proc","portal"],
  Documents:["docs","sheets","present"],
  "Visual tools":["design","photo","layout","video","motion"],
  Platform:["web","forms","build","connect","it"],
};
let count = 0;
for (const [group, apps] of Object.entries(groups)) {
  if (!apps.every(app => registry.includes(`group: "${group} / ${app}"`))) throw new Error(`Missing native application mapping in ${group}`);
  for (const app of apps) {
    const seed = [`src/domain/seeds/${app}.ts`,`src/domain/seeds/${app}.tsx`].find(existsSync);
    const native = [`src/applications/${app}/index.tsx`,`src/applications/${app}/index.ts`].find(existsSync);
    if (!seed) throw new Error(`Missing seed module: ${app}`);
    if (!native) throw new Error(`Missing native module: ${app}`);
    if (!registry.includes(`import("@/domain/seeds/${app}")`))
      throw new Error(`Missing seed import for ${app} in ${group}`);
    if (!registry.includes(`import("./${app}/index")`))
      throw new Error(`Missing screen registration for ${app} in ${group}`);
    count++;
  }
}
if (!registry.includes('group: "Headquarters"')) throw new Error("Missing headquarters critical app");
console.log(`Verified ${count} native applications in ${Object.keys(groups).length} non-core workstreams, with matching seed and screen imports.`);
