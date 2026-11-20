import { describe, expect, it } from "vitest";
import "@/domain/seeds/flagshipCollective";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { SEED_NOW } from "@/domain/types";
import { readSite, themeCss } from "@/applications/web/model";

const flagship=collectSeedsByContributor(SEED_NOW).find(group=>group.key==="flagship-collective");
const siteRecord=flagship?.records.find(record=>record.id==="nl-sites-900");

describe("Northline native Web site identity contract",()=>{
  it("preserves selected Manrope font and paper/acid design values",()=>{
    expect(siteRecord).toBeDefined();
    const site=readSite(siteRecord);
    expect(site.theme.font).toBe("Manrope");
    expect(site.theme.ink).toBe("#151515");
    expect(site.theme.paper).toBe("#f3f0e8");
    expect(site.theme.accent).toBe("#dfff3f");
    expect(site.theme.radius).toBe(0);
    expect(site.pages.length).toBe(7);
    expect(site.seo.robots).toBe("noindex");
  });
  it("exports meaningful named font stacks rather than undefined CSS",()=>{
    const site=readSite(siteRecord);
    const css=themeCss(site.theme);
    expect(css).toContain("font-family:Manrope, Arial, sans-serif");
    expect(css).toContain("--accent:#dfff3f");
    expect(css).not.toContain("undefined");
    for(const font of ["Newsreader","DM Mono"] as const){
      const value=themeCss({...site.theme,font});
      expect(value).toContain("font-family:");
      expect(value).not.toContain("undefined");
    }
  });
  it("keeps legacy fallback and other tenants' choices intact",()=>{
    const site=readSite(siteRecord);
    expect(readSite({...siteRecord!,body:{...(siteRecord!.body as Record<string,unknown>),theme:{...site.theme,font:"nonexistent font"}}}).theme.font).toBe("Inter");
    expect(themeCss({...site.theme,font:"Inter"})).toContain("Inter, system-ui, sans-serif");
  });
});
