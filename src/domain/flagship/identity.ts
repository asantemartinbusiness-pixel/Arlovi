/**
 * Northline Collective — Paper / Acid identity.
 *
 * Adapted, with original business copy and motifs, from the user-supplied
 * "Strut — paper meets acid" visual reference. No Strut marks, art, or claims.
 *
 * Scope: the fictional Northline flagship only. This is NOT the Arlovi OS
 * global design system, and not a theme for the unrelated Harbor tenant.
 */
export const NORTHLINE_COLLECTIVE_IDENTITY = {
  name: "Northline Collective",
  direction: "Material. Space. Experience.",
  expression: "The working paper — a living collage of materials, decisions and craft.",
  palette: {
    acid: "#dfff3f",
    violet: "#7e57ff",
    apricot: "#e6a868",
    bluePaper: "#b8d8fe",
    ink: "#151515",
    night: "#111111",
    stage: "#171717",
    darkRule: "#333333",
    yellowInk: "#3f4033",
    body: "#4f4d48",
    muted: "#6c6a64",
    rule: "#cbc7bd",
    canvas: "#f3f0e8",
    white: "#ffffff",
    paperTint: "#fbffe0",
    orange: "#f47b31",
    editorialBlue: "#3478f6",
    green: "#a8c91a",
    teal: "#0fb69b",
    pink: "#ed5b92",
  },
  typography: {
    display: { font: "Manrope", weight: 700, size: "clamp(58px, 6.4vw, 104px)", lineHeight: .88, tracking: "-.075em" },
    displayItalic: { font: "Newsreader", weight: 500, style: "italic", size: "clamp(58px, 6.4vw, 104px)", lineHeight: .88, tracking: "-.075em" },
    heading: { font: "Manrope", weight: 700, size: "clamp(42px, 5vw, 76px)", lineHeight: .95, tracking: "-.06em" },
    eyebrow: { font: "DM Mono", weight: 400, size: "10px", lineHeight: 1.3, tracking: ".12em" },
    body: { font: "Manrope", weight: 400, size: "16px", lineHeight: 1.65 },
    reading: { font: "Georgia", weight: 400, size: "19px", lineHeight: 1.8 },
  },
  layout: {
    maxWidth: 1600,
    sectionPadding: 120,
    openingTextRatio: .48,
    openingArtRatio: .52,
    navigationHeight: 72,
    buttonHeight: 41,
    cardRadius: 0,
    panelStroke: 1,
  },
  approvedMotifs: [
    "physical paper overlaps and hard-edged printed notes",
    "violet planes, translucent tracing sheets and graphite loops",
    "acid-yellow hand-drawn directional mark",
    "mixed geometric-sans and italic editorial-serif headline",
    "square outlined panels and thin paper seams",
    "purposeful acid conversion band and dark directory footer",
  ],
  prohibit: [
    "Strut name, logo, imagery, quotes or unrelated product claims",
    "generic floating glass cards, rainbow gradients or rounded pill mosaics",
    "fabricated photography licences, AI delivery receipts or customer feedback",
    "presenting scenario dashboards as posted accounting figures",
  ],
  accessibility: {
    reducedMotion: true,
    highContrastFocus: "#151515",
    darkFocus: "#dfff3f",
    keyboardNavigation: true,
    mobileCollageRetained: true,
  },
  labels: {
    fictional: "Fictional Arlovi flagship simulation",
    site: "Northline Collective / Made for the way we live.",
    mark: "N/C",
  },
} as const;

export const NORTHLINE_COLORS = NORTHLINE_COLLECTIVE_IDENTITY.palette;
