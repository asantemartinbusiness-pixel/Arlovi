import { describe, expect, it } from "vitest";
import "@/domain/seeds/flagshipStudio";
import { collectSeedsByContributor } from "@/domain/seedRegistry";
import { ORG_NORTHLINE, SEED_NOW } from "@/domain/types";

const studio = collectSeedsByContributor(SEED_NOW).find(item => item.key === "flagship-studio");
const item = (id: string) => studio!.records.find(record => record.id === id)!;

describe("Northline Collective — native creative studio", () => {
  it("registers deterministic, isolated, reviewable drafts", () => {
    expect(studio).toBeDefined();
    expect(studio!.records).toHaveLength(6);
    expect(new Set(studio!.records.map(record => record.id)).size).toBe(6);
    expect(studio!.records.every(record => record.organizationId === ORG_NORTHLINE)).toBe(true);
    expect(studio!.records.every(record => record.status === "draft")).toBe(true);
    expect(studio!.records.every(record => record.fields.fictional === true)).toBe(true);
    expect(studio!.records.every(record => record.fields.delivery === "local_only")).toBe(true);
  });

  it("contains genuine editable scene graphs with valid layer references", () => {
    for (const [id, numberOfArtboards] of [["nl-designs-910", 3], ["nl-designs-911", 2]] as const) {
      const doc = item(id).body as {
        version: number;
        pages: { id: string; children: Record<string, string[]>; nodes: Record<string, { kind: string }> }[];
        textStyles: unknown[]; colors: unknown[];
      };
      expect(doc.version).toBe(2);
      expect(doc.pages).toHaveLength(numberOfArtboards);
      expect(doc.colors.length).toBeGreaterThanOrEqual(6);
      expect(doc.textStyles.length).toBeGreaterThanOrEqual(3);
      for (const page of doc.pages) {
        const roots = page.children[page.id];
        expect(roots).toHaveLength(1);
        for (const [parent, kids] of Object.entries(page.children)) {
          expect(parent === page.id || Boolean(page.nodes[parent])).toBe(true);
          for (const child of kids) expect(page.nodes[child]).toBeDefined();
        }
        expect(Object.values(page.nodes).some(node => node.kind === "text")).toBe(true);
        expect(Object.values(page.nodes).some(node => node.kind === "rect")).toBe(true);
      }
    }
  });

  it("builds a true paginated eight-page publication with live text stories", () => {
    const doc = item("nl-publications-910").body as {
      version: number;
      pages: {id: string;frames: {kind: string;storyId?: string}[]}[];
      stories: {id:string}[]; paragraphStyles: unknown[];
    };
    expect(doc.version).toBe(2);
    expect(doc.pages).toHaveLength(8);
    const storyIds = new Set(doc.stories.map(story => story.id));
    expect(storyIds.size).toBe(8);
    for (const page of doc.pages) {
      const text = page.frames.find(frame => frame.kind === "text");
      expect(text?.storyId && storyIds.has(text.storyId)).toBe(true);
      expect(page.frames.some(frame => frame.kind === "folio")).toBe(true);
    }
    expect(doc.paragraphStyles.length).toBeGreaterThan(4);
  });

  it("creates a non-published editable multitrack film with source-backed proxies", () => {
    const doc = item("nl-videos-910").body as {
      version:number;duration:number;
      tracks:{id:string}[];
      clips:{trackId:string;sourceId:string;start:number;duration:number}[];
      sources:{id:string;license:string}[];
      captions:unknown[];
      renders:unknown[];
    };
    expect(doc.version).toBe(2);
    expect(doc.duration).toBe(60);
    expect(doc.tracks).toHaveLength(3);
    expect(doc.captions).toHaveLength(4);
    expect(doc.renders).toEqual([]);
    const sourceIds = new Set(doc.sources.map(source => source.id));
    const trackIds = new Set(doc.tracks.map(track => track.id));
    for (const clip of doc.clips) {
      expect(trackIds.has(clip.trackId)).toBe(true);
      expect(clip.start + clip.duration).toBeLessThanOrEqual(60);
      if (clip.sourceId) expect(sourceIds.has(clip.sourceId)).toBe(true);
    }
    expect(doc.sources.every(source => /demo|procedural|synthetic/i.test(source.license))).toBe(true);
  });

  it("labels layered photo studies as generated instead of licensed real photography", () => {
    for (const id of ["nl-photos-910", "nl-photos-911"]) {
      const doc = item(id).body as {
        version:number; layers:{kind:string}[];
        origin:string;rights:{license:string};
      };
      expect(doc.version).toBe(2);
      expect(doc.layers.map(layer => layer.kind)).toEqual(["pixel","fill","adjustment"]);
      expect(doc.origin).toMatch(/generated raster preview/i);
      expect(doc.rights.license).toMatch(/demonstration/i);
    }
  });
});
