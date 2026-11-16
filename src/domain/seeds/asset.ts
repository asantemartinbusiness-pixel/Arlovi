import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * ASSET fixtures — the media library.
 *
 * Honesty rule that shapes this file: a record never claims a file that is
 * not here. Each asset declares its `fileState`:
 *   stored_svg       the markup is in the record and is what you see
 *   generated_preview  nothing is stored; the preview is drawn in the browser
 *                      from the record's own palette and shape fields
 *   metadata_only    no file and no preview, only catalogued metadata
 * ====================================================================== */

registerSeed("asset", (ctx) => {
  const base = Date.parse(ctx.now);
  const at = (hoursAgo: number) => new Date(base - hoursAgo * 3_600_000).toISOString();
  const inDays = (days: number) => new Date(base + days * 86_400_000).toISOString();
  const records: Rec[] = [];

  const svgWordmark = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 64'><rect width='240' height='64' rx='10' fill='#0B1020'/><circle cx='34' cy='32' r='13' fill='#234FE8'/><circle cx='52' cy='32' r='8' fill='#FFAE7C'/><text x='76' y='40' font-family='Inter,system-ui,sans-serif' font-size='22' font-weight='700' fill='#F7F8FB'>Northline</text></svg>";
  const svgMark = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect rx='14' width='64' height='64' fill='#234FE8'/><circle cx='24' cy='32' r='6' fill='#FFAE7C'/><circle cx='40' cy='32' r='6' fill='#36C5BA'/></svg>";
  const svgMarkMono = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect rx='14' width='64' height='64' fill='#0B1020'/><circle cx='24' cy='32' r='6' fill='#F7F8FB'/><circle cx='40' cy='32' r='6' fill='#F7F8FB'/></svg>";
  const svgIconSet = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 32'><g fill='none' stroke='#0B1020' stroke-width='2'><circle cx='16' cy='16' r='9'/><rect x='39' y='7' width='18' height='18' rx='4'/><path d='M71 25l9-18 9 18z'/></g></svg>";

  const asset = (
    n: number,
    title: string,
    summary: string,
    fields: Record<string, string | number | boolean>,
    hoursAgo: number,
    options: { org?: "nl" | "hb"; status?: string; owner?: string; body?: unknown; tags?: string[]; parentId?: string } = {},
  ) => records.push(ctx.rec({
    org: options.org ?? "nl",
    collection: "assets",
    n,
    title,
    status: options.status ?? "approved",
    summary,
    owner: options.owner,
    at: at(hoursAgo),
    parentId: options.parentId,
    tags: options.tags ?? [],
    fields,
    body: options.body,
  }));

  /* ---------------- Brand marks: real SVG held in the record ---------------- */
  asset(20, "Northline wordmark — dark", "The wordmark as used on dark backgrounds. The markup is in this record.", {
    kind: "logo", format: "svg", fileState: "stored_svg", width: 240, height: 64, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", approvedBy: "Maya Chen", checksum: "wm-dark-01", usedIn: "Winter collection deck, Showroom signage, Invoice template",
    palette: "#0B1020,#234FE8,#FFAE7C", shape: "wordmark", version: 3,
  }, 300, { body: { svg: svgWordmark }, tags: ["brand", "logo", "master"] });

  asset(21, "Northline mark — colour", "Square mark for avatars and favicons. Markup held here.", {
    kind: "logo", format: "svg", fileState: "stored_svg", width: 64, height: 64, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", approvedBy: "Maya Chen", checksum: "mark-col-01", usedIn: "Workspace avatar, Client portal, Quote header",
    palette: "#234FE8,#FFAE7C,#36C5BA", shape: "mark", version: 2,
  }, 300, { body: { svg: svgMark }, tags: ["brand", "logo", "master"] });

  asset(22, "Northline mark — mono", "One-colour mark for engraving and single-colour print.", {
    kind: "logo", format: "svg", fileState: "stored_svg", width: 64, height: 64, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", approvedBy: "Maya Chen", checksum: "mark-mono-01", usedIn: "Packaging stamp",
    palette: "#0B1020,#F7F8FB", shape: "mark", version: 1,
  }, 290, { body: { svg: svgMarkMono }, tags: ["brand", "logo"] });

  asset(23, "Fitting icon set", "Three fitting silhouettes used in the catalogue and spec sheets.", {
    kind: "icon", format: "svg", fileState: "stored_svg", width: 96, height: 32, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", approvedBy: "Maya Chen", checksum: "icons-01", usedIn: "Catalogue, Spec sheet template",
    palette: "#0B1020", shape: "icons", version: 1,
  }, 210, { body: { svg: svgIconSet }, tags: ["brand", "icon"] });

  /* ---------------- Product imagery: preview drawn from the record ---------------- */
  asset(24, "Ravelin pendant — hero", "Studio shot used on the product page. No camera original is kept in this browser.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 2400, height: 1600, licence: "owned", licensor: "Northline Atelier",
    photographer: "Priya Shah", approvedBy: "Maya Chen", checksum: "rav-hero-01", usedIn: "Ravelin product page, Winter collection deck, Lumen quote",
    palette: "#234FE8,#FFAE7C,#F7F8FB", shape: "pendant", version: 4, productId: "nl-products-001",
  }, 120, { tags: ["product", "ravelin", "hero"] });

  asset(25, "Ravelin pendant — detail", "Close detail of the brushed collar.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 1800, height: 1800, licence: "owned", licensor: "Northline Atelier",
    photographer: "Priya Shah", approvedBy: "Maya Chen", checksum: "rav-detail-01", usedIn: "Ravelin product page",
    palette: "#FFAE7C,#0B1020,#F7F8FB", shape: "detail", version: 1, productId: "nl-products-001",
  }, 118, { tags: ["product", "ravelin"] });

  asset(26, "Kinsale install — showroom", "Installed set at the Kinsale site, used with the client's permission.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 2000, height: 1333, licence: "licensed", licensor: "Kinsale Hotel",
    photographer: "Theo Marsh", approvedBy: "Maya Chen", checksum: "kin-01", usedIn: "Case study, Winter collection deck",
    licenceExpiry: inDays(40), palette: "#36C5BA,#0B1020,#FFAE7C", shape: "interior", version: 2,
  }, 90, { tags: ["case-study", "kinsale"] });

  asset(27, "Harbour dusk — stock", "Licensed stock image. The licence lapsed, so it cannot be used in anything published.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 3000, height: 2000, licence: "stock", licensor: "Northlight Stock",
    licenceExpiry: at(400), licenceRef: "NLS-22841", approvedBy: "Maya Chen", checksum: "harb-01", usedIn: "Autumn newsletter (withdrawn)",
    palette: "#0B1020,#36C5BA,#FFAE7C", shape: "wave", version: 1,
  }, 700, { status: "approved", tags: ["stock", "expired"] });

  asset(28, "Workshop bench — process", "Process shot for the about page. Licence expires soon.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 2200, height: 1467, licence: "licensed", licensor: "Dara Finch Photography",
    licenceExpiry: inDays(9), licenceRef: "DFP-2026-17", approvedBy: "Maya Chen", checksum: "bench-01", usedIn: "About page, Recruitment post",
    palette: "#FFAE7C,#F7F8FB,#0B1020", shape: "bench", version: 1,
  }, 400, { tags: ["process", "about"] });

  asset(29, "Showroom window — evening", "Shot kept for the next seasonal campaign. Not approved for use yet.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 2048, height: 1365, licence: "owned", licensor: "Northline Atelier",
    photographer: "Amara Diallo", checksum: "window-01", usedIn: "",
    palette: "#234FE8,#0B1020,#36C5BA", shape: "window", version: 1,
  }, 30, { status: "pending_review", owner: "Amara Diallo", tags: ["showroom", "draft"] });

  asset(30, "Ravelin pendant — hero (duplicate upload)", "Same image uploaded twice. Resolve against the approved original.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 2400, height: 1600, licence: "owned", licensor: "Northline Atelier",
    photographer: "Priya Shah", checksum: "rav-hero-01", usedIn: "Instagram draft",
    palette: "#234FE8,#FFAE7C,#F7F8FB", shape: "pendant", version: 1, duplicateOf: "nl-assets-024",
  }, 26, { status: "pending_review", owner: "Priya Shah", tags: ["product", "duplicate"] });

  asset(31, "Workshop bench — process (resized copy)", "A second upload of the same licensed shot at a different size.", {
    kind: "image", format: "png", fileState: "generated_preview", width: 1200, height: 800, licence: "licensed", licensor: "Dara Finch Photography",
    licenceExpiry: inDays(9), licenceRef: "DFP-2026-17", checksum: "bench-01", usedIn: "",
    palette: "#FFAE7C,#F7F8FB,#0B1020", shape: "bench", version: 1, duplicateOf: "nl-assets-028",
  }, 24, { status: "pending_review", owner: "Theo Marsh", tags: ["process", "duplicate"] });

  /* ---------------- Variants of the hero, kept as children ---------------- */
  asset(32, "Ravelin hero — 1200×630 social", "Cropped variant produced by the Social card preset.", {
    kind: "image", format: "png", fileState: "generated_preview", width: 1200, height: 630, licence: "owned", licensor: "Northline Atelier",
    approvedBy: "Maya Chen", checksum: "rav-hero-01-social", usedIn: "Winter collection campaign", variantOf: "nl-assets-024",
    presetId: "nl-transforms-020", palette: "#234FE8,#FFAE7C,#F7F8FB", shape: "pendant", version: 1, crop: "centre, 1.9:1",
  }, 110, { parentId: "nl-assets-024", tags: ["variant", "social"] });

  asset(33, "Ravelin hero — 800×800 catalogue", "Square variant for the catalogue grid.", {
    kind: "image", format: "png", fileState: "generated_preview", width: 800, height: 800, licence: "owned", licensor: "Northline Atelier",
    approvedBy: "Maya Chen", checksum: "rav-hero-01-square", usedIn: "Catalogue grid", variantOf: "nl-assets-024",
    presetId: "nl-transforms-021", palette: "#234FE8,#FFAE7C,#F7F8FB", shape: "pendant", version: 1, crop: "centre, 1:1",
  }, 110, { parentId: "nl-assets-024", tags: ["variant", "catalogue"] });

  asset(34, "Ravelin hero — 320×180 thumbnail", "Small thumbnail for list views and the quote preview.", {
    kind: "image", format: "png", fileState: "generated_preview", width: 320, height: 180, licence: "owned", licensor: "Northline Atelier",
    approvedBy: "Maya Chen", checksum: "rav-hero-01-thumb", usedIn: "Quote preview", variantOf: "nl-assets-024",
    presetId: "nl-transforms-022", palette: "#234FE8,#FFAE7C,#F7F8FB", shape: "pendant", version: 1, crop: "centre, 16:9",
  }, 109, { parentId: "nl-assets-024", tags: ["variant", "thumbnail"] });

  /* ---------------- Templates and documents ---------------- */
  asset(35, "Quote template", "Approved layout for quotes. Uses the wordmark and the brand type scale.", {
    kind: "template", format: "svg", fileState: "stored_svg", width: 420, height: 297, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", approvedBy: "Maya Chen", checksum: "tpl-quote-01", usedIn: "All quotes since October",
    palette: "#F7F8FB,#234FE8,#0B1020", shape: "sheet", version: 2,
  }, 260, {
    body: { svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 297'><rect width='420' height='297' fill='#F7F8FB'/><rect x='0' y='0' width='420' height='34' fill='#0B1020'/><circle cx='20' cy='17' r='8' fill='#234FE8'/><text x='36' y='22' font-family='Inter,system-ui,sans-serif' font-size='12' fill='#F7F8FB'>Northline Atelier — Quote</text><g fill='#0B1020' opacity='0.14'><rect x='24' y='58' width='180' height='8' rx='4'/><rect x='24' y='78' width='120' height='8' rx='4'/><rect x='24' y='120' width='372' height='1'/><rect x='24' y='140' width='372' height='8' rx='4'/><rect x='24' y='158' width='372' height='8' rx='4'/><rect x='24' y='176' width='240' height='8' rx='4'/></g><rect x='296' y='236' width='100' height='26' rx='6' fill='#234FE8'/></svg>" },
    tags: ["template", "brand"],
  });

  asset(36, "Spec sheet template", "Two-column spec sheet used with the fitting icons.", {
    kind: "template", format: "svg", fileState: "stored_svg", width: 420, height: 297, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", approvedBy: "Maya Chen", checksum: "tpl-spec-01", usedIn: "Ravelin spec sheet, Kinsale handover pack",
    palette: "#FFFFFF,#36C5BA,#0B1020", shape: "sheet", version: 1,
  }, 250, {
    body: { svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 297'><rect width='420' height='297' fill='#FFFFFF'/><rect x='0' y='0' width='8' height='297' fill='#36C5BA'/><g fill='#0B1020' opacity='0.16'><rect x='32' y='32' width='150' height='10' rx='5'/><rect x='32' y='64' width='160' height='6' rx='3'/><rect x='32' y='80' width='160' height='6' rx='3'/><rect x='32' y='96' width='120' height='6' rx='3'/><rect x='228' y='64' width='160' height='6' rx='3'/><rect x='228' y='80' width='160' height='6' rx='3'/><rect x='228' y='96' width='140' height='6' rx='3'/></g><rect x='228' y='140' width='160' height='110' rx='8' fill='#0B1020' opacity='0.07'/></svg>" },
    tags: ["template", "brand"],
  });

  /* ---------------- Fonts and video: catalogued, no file here ---------------- */
  asset(37, "Hanken Grotesk", "The workspace typeface. Served by the application, not stored as an asset file.", {
    kind: "font", format: "woff2", fileState: "metadata_only", licence: "royalty_free", licensor: "The Hanken Grotesk Project Authors",
    licenceRef: "SIL Open Font License 1.1", approvedBy: "Maya Chen", checksum: "font-hanken-grotesk", usedIn: "Every surface in this workspace",
    weights: "300–600", version: 1,
  }, 2_000, { tags: ["brand", "type"] });

  asset(38, "Bodoni Display", "Licensed display face for the collection headline. Seat licence, two users.", {
    kind: "font", format: "otf", fileState: "metadata_only", licence: "licensed", licensor: "Crescent Type",
    licenceRef: "CT-2026-884", licenceExpiry: inDays(210), seats: 2, approvedBy: "Maya Chen", checksum: "font-bodoni",
    usedIn: "Winter collection deck", weights: "400,700", version: 1,
  }, 1_400, { tags: ["type"] });

  asset(39, "Showroom walkthrough", "Phone video of the showroom. Catalogued so the campaign can reference it; the file lives on the camera roll.", {
    kind: "video", format: "mp4", fileState: "metadata_only", durationSeconds: 48, width: 1920, height: 1080,
    licence: "owned", licensor: "Northline Atelier", approvedBy: "Maya Chen", checksum: "vid-walk-01",
    usedIn: "Winter collection campaign (planned)", palette: "#0B1020,#234FE8", version: 1,
  }, 60, { tags: ["video", "showroom"] });

  /* ---------------- Archived ---------------- */
  asset(40, "Northline wordmark — 2024", "Superseded wordmark. Archived so old documents still resolve.", {
    kind: "logo", format: "svg", fileState: "stored_svg", width: 240, height: 64, licence: "owned", licensor: "Northline Atelier",
    brandId: "nl-brands-001", checksum: "wm-2024", usedIn: "Invoices before October 2025", supersededBy: "nl-assets-020",
    palette: "#0B1020,#2E7D6B", shape: "wordmark", version: 1, retentionUntil: inDays(900), retentionBasis: "Kept while old documents reference it",
  }, 9_000, {
    status: "archived",
    body: { svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 64'><rect width='240' height='64' rx='10' fill='#0B1020'/><rect x='22' y='24' width='34' height='16' rx='3' fill='#2E7D6B'/><text x='68' y='40' font-family='Inter,system-ui,sans-serif' font-size='20' font-weight='600' fill='#F7F8FB'>NORTHLINE</text></svg>" },
    tags: ["brand", "archived"],
  });

  asset(41, "Autumn newsletter banner", "Archived with the expired stock image it was built from.", {
    kind: "image", format: "png", fileState: "generated_preview", width: 1200, height: 400, licence: "stock", licensor: "Northlight Stock",
    licenceExpiry: at(400), licenceRef: "NLS-22841", checksum: "news-aut-01", usedIn: "", derivedFrom: "nl-assets-027",
    palette: "#0B1020,#36C5BA", shape: "wave", version: 1, retentionUntil: inDays(30), retentionBasis: "Licence lapsed; keep 30 days for the record",
  }, 700, { status: "archived", tags: ["campaign", "archived"] });

  /* ---------------- Harbor Supply keeps its own, smaller library ---------------- */
  asset(20, "Harbor Supply mark", "Harbor's own mark. Kept in the Harbor workspace only.", {
    kind: "logo", format: "svg", fileState: "stored_svg", width: 64, height: 64, licence: "owned", licensor: "Harbor Supply",
    approvedBy: "Elena Ward", checksum: "hb-mark-01", usedIn: "Harbor quotes", palette: "#0F8780,#F7F8FB", shape: "mark", version: 1,
  }, 500, {
    org: "hb", owner: "Elena Ward",
    body: { svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect rx='14' width='64' height='64' fill='#0F8780'/><path d='M20 42V22h6v8h12v-8h6v20h-6v-7H26v7z' fill='#F7F8FB'/></svg>" },
    tags: ["brand", "logo", "master"],
  });
  asset(21, "Dockside storage — site photo", "Site record for the storage lease decision.", {
    kind: "image", format: "jpg", fileState: "generated_preview", width: 2000, height: 1333, licence: "owned", licensor: "Harbor Supply",
    approvedBy: "Elena Ward", checksum: "hb-dock-01", usedIn: "Dockside storage lease", palette: "#0F8780,#0B1020,#FFAE7C", shape: "interior", version: 1,
  }, 60, { org: "hb", owner: "Elena Ward", tags: ["site"] });
  asset(22, "Harbor price list template", "Plain price list layout.", {
    kind: "template", format: "svg", fileState: "stored_svg", width: 420, height: 297, licence: "owned", licensor: "Harbor Supply",
    approvedBy: "Elena Ward", checksum: "hb-tpl-01", usedIn: "Harbor price list", palette: "#FFFFFF,#0F8780", shape: "sheet", version: 1,
  }, 400, {
    org: "hb", owner: "Elena Ward",
    body: { svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 297'><rect width='420' height='297' fill='#FFFFFF'/><rect y='0' width='420' height='26' fill='#0F8780'/><g fill='#0B1020' opacity='0.15'><rect x='24' y='50' width='372' height='7' rx='3'/><rect x='24' y='68' width='372' height='7' rx='3'/><rect x='24' y='86' width='280' height='7' rx='3'/></g></svg>" },
    tags: ["template"],
  });

  /* ---------------- Brand kits ---------------- */
  records.push(ctx.rec({
    org: "nl", collection: "brands", n: 20, title: "Northline — master", status: "active",
    summary: "The active identity. Logos, palette, type and the rules that govern their use.",
    fields: {
      master: true, approvedBy: "Maya Chen", approvedAt: at(300), logoAssetId: "nl-assets-020", markAssetId: "nl-assets-021",
      ink: "#0B1020", cobalt: "#234FE8", papaya: "#FFAE7C", aqua: "#36C5BA", paper: "#F7F8FB",
      headingFont: "Bodoni Display", bodyFont: "Inter", scale: "1.25", radius: "10px",
      assets: "nl-assets-020,nl-assets-021,nl-assets-022,nl-assets-023,nl-assets-035,nl-assets-036",
    },
    body: {
      voice: "Warm, precise, never theatrical.",
      rules: [
        "The wordmark keeps clear space of at least the height of the mark on every side.",
        "Cobalt is for one accent per surface. Papaya and aqua never carry body text.",
        "Only the mono mark may be reproduced in a single colour.",
        "Photography keeps the paper background; cut-outs are not used in the catalogue.",
      ],
    },
    tags: ["brand", "master"],
  }));
  records.push(ctx.rec({
    org: "nl", collection: "brands", n: 21, title: "Northline Projects", status: "active",
    summary: "Sub-brand for the install side of the business. Shares the mark, changes the accent.",
    fields: {
      master: false, approvedBy: "Maya Chen", approvedAt: at(180), logoAssetId: "nl-assets-021", markAssetId: "nl-assets-021",
      ink: "#0B1020", cobalt: "#1F7A6D", papaya: "#FFAE7C", aqua: "#36C5BA", paper: "#F4F6F5",
      headingFont: "Inter", bodyFont: "Inter", scale: "1.2", radius: "8px", parentBrandId: "nl-brands-020",
      assets: "nl-assets-021,nl-assets-022,nl-assets-036",
    },
    body: { voice: "Practical and exact. Written for site teams.", rules: ["Use the mono mark on site documents.", "Never mix the Projects accent with cobalt on one page."] },
    tags: ["brand", "sub-brand"],
  }));
  records.push(ctx.rec({
    org: "nl", collection: "brands", n: 22, title: "Winter collection (proposed)", status: "draft",
    summary: "Seasonal palette proposal. Cannot replace the master brand until it is approved.",
    fields: {
      master: false, logoAssetId: "nl-assets-020", markAssetId: "nl-assets-021",
      ink: "#141019", cobalt: "#3A2BD9", papaya: "#FF9A62", aqua: "#7BD6CB", paper: "#FBF7F2",
      headingFont: "Bodoni Display", bodyFont: "Inter", scale: "1.333", radius: "14px", parentBrandId: "nl-brands-020",
      assets: "nl-assets-020,nl-assets-024,nl-assets-038", proposedBy: "Sable Nguyen",
    },
    body: { voice: "Seasonal, a little warmer.", rules: ["Only for the winter campaign surfaces.", "Reverts to the master palette in January."] },
    tags: ["brand", "draft"],
  }));
  records.push(ctx.rec({
    org: "hb", collection: "brands", n: 20, title: "Harbor Supply", status: "active",
    summary: "Harbor's identity. Separate workspace, separate rules.",
    fields: {
      master: true, approvedBy: "Elena Ward", approvedAt: at(500), logoAssetId: "hb-assets-020", markAssetId: "hb-assets-020",
      ink: "#0B1020", cobalt: "#0F8780", papaya: "#E8A33C", aqua: "#5FB8B2", paper: "#FFFFFF",
      headingFont: "Inter", bodyFont: "Inter", scale: "1.2", radius: "6px", assets: "hb-assets-020,hb-assets-022",
    },
    body: { voice: "Plain and direct.", rules: ["One accent colour only.", "No seasonal palettes."] },
    tags: ["brand", "master"],
  }));

  /* ---------------- Transformation presets and jobs ---------------- */
  const preset = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status = "published") =>
    records.push(ctx.rec({ org: "nl", collection: "transforms", n, title, status, summary, fields, tags: ["preset"] }));

  preset(20, "Social card 1200×630", "Centre crop to 1.9:1 for link previews and social posts.", {
    kind: "preset", width: 1200, height: 630, fit: "cover", focus: "centre", format: "png", quality: 82, watermark: false, channel: "Social", uses: 14,
  });
  preset(21, "Catalogue square 800×800", "Square crop on the paper background for the catalogue grid.", {
    kind: "preset", width: 800, height: 800, fit: "contain", focus: "centre", format: "png", quality: 88, watermark: false, background: "#F7F8FB", channel: "Catalogue", uses: 26,
  });
  preset(22, "List thumbnail 320×180", "Small 16:9 thumbnail for grids and quote previews.", {
    kind: "preset", width: 320, height: 180, fit: "cover", focus: "centre", format: "png", quality: 76, watermark: false, channel: "In-app", uses: 48,
  });
  preset(23, "Press 2400 wide", "Long edge 2400 for press and print requests, with the wordmark applied.", {
    kind: "preset", width: 2400, height: 1600, fit: "cover", focus: "centre", format: "jpg", quality: 94, watermark: true, watermarkAssetId: "nl-assets-020", channel: "Press", uses: 3,
  });
  preset(24, "Client proof (draft)", "Watermarked proof for client review. Not published yet.", {
    kind: "preset", width: 1600, height: 1200, fit: "contain", focus: "centre", format: "jpg", quality: 70, watermark: true, watermarkAssetId: "nl-assets-022", channel: "Proofs", uses: 0,
  }, "draft");

  const job = (n: number, title: string, summary: string, fields: Record<string, string | number | boolean>, status: string, hoursAgo: number) =>
    records.push(ctx.rec({ org: "nl", collection: "transforms", n, title, status, summary, at: at(hoursAgo), fields, tags: ["job"] }));

  job(25, "Social cards for the winter campaign", "Three assets through the Social card preset.", {
    kind: "job", presetId: "nl-transforms-020", assetIds: "nl-assets-024,nl-assets-025,nl-assets-026", produced: 3, failed: 0, requestedBy: "Priya Shah", overwrite: false,
  }, "done", 110);
  job(26, "Catalogue grid refresh", "Eleven catalogue squares rebuilt after the paper colour changed.", {
    kind: "job", presetId: "nl-transforms-021", assetIds: "nl-assets-024,nl-assets-025", produced: 2, failed: 0, requestedBy: "Maya Chen", overwrite: false,
  }, "done", 48);
  job(27, "Press pack for Northlight feature", "Blocked: the stock licence on one asset had lapsed.", {
    kind: "job", presetId: "nl-transforms-023", assetIds: "nl-assets-027,nl-assets-024", produced: 0, failed: 2, requestedBy: "Priya Shah", overwrite: false,
    failureReason: "Harbour dusk — stock has an expired licence, so it cannot be used in a published pack.",
  }, "failed", 26);
  job(28, "Thumbnail rebuild", "Failed part way: one source asset has no file in this browser.", {
    kind: "job", presetId: "nl-transforms-022", assetIds: "nl-assets-024,nl-assets-039", produced: 1, failed: 1, requestedBy: "Maya Chen", overwrite: false,
    failureReason: "Showroom walkthrough is catalogued as metadata only, so there is nothing to resize.",
  }, "failed", 20);

  return { records };
});
