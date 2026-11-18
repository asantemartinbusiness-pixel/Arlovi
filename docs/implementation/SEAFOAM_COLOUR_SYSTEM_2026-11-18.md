# Arlovi Seafoam — colour orchestration contract
Approved direction: 18 November 2026. Applies to all first-party applications and shared UI.

## Decision
The default theme is **light**, with white and neutral surfaces dominant. Brand pastel Seafoam is `#D7F0E8`; the primary interactive colour is `#2D6B65`; the stronger ink is `#174A44`. Secondary pastels are Lilac `#E9DFFA`, Butter `#FFF0C8`, Peach `#FCE7D6`, and Sage `#DDEDDC`. Blue and blush pink are retired as Arlovi defaults.

## Colour-area hierarchy
Aim for roughly **90% neutral surfaces, 7% pale tints, 3% strong brand colour** on operational screens. This is an editorial guide, not pixel-computed compliance. Ordinary typography and dense analytical content are excluded from those ratios. The primary colour must not become a full sidebar, full KPI card, or ubiquitous hero background.

## Placement rules
- **Shell and documents**: white header, white sidebars, neutral canvas and white record panels. Borders and typography establish structure.
- **Navigation and selection**: small Seafoam tint and one independent marker/underline/border; never tint every tab or group.
- **Primary actions**: deep Seafoam, generally one dominant action per decision area. Secondary controls neutral.
- **KPIs and data grids**: white cards; small trend/status accents; row selection uses the lightest tint. Never rainbow-fill metrics.
- **Popovers, drawers, modals**: white; contextual colour only when content requires it.
- **App families**: People may use small Lilac motifs; Growth Peach; Planning Butter; Intelligence Seafoam; Finance reserved status/contrast green. App accents do not recolour chrome.
- **Onboarding**: more expressive than accounting, but do not use oversized colourful gradients or large pastel slabs.
- **AI employees**: source/provenance marker, task status and accountability—not neon glows, random sparkles or large dark AI cards.
- **Charts**: use `--series-1` to `--series-8` for categorical series, distinct from brand and operational status; add labels, legends and line styles. Sequential/diverging charts require domain-specific palettes, never generic pastel rotation.
- **Semantic states**: success `#166B50`, warning `#895800`, danger `#B42332`, info `#5D4B84`, with soft backgrounds. Meaning never changes with selected palette or tenant colour.

## Theme and tenant policy
- Personal theme/palette in Appearance & display is browser-local; Seafoam light is the default.
- Legacy cobalt defaults migrate to Seafoam; old other presets map to their closest muted alternatives.
- Tenant accent is independent of personal appearance and operational states. The onboarding picker offers muted brand colours and custom hex. The company switcher computes high-contrast lettering for its accent swatch.
- Existing custom organisation colours remain unchanged. New organisations use deep Seafoam by default.
- Dark is opt-in, and preserves readable semantic tokens. Do not recolour dark surfaces with large saturated panels.

## Review checklist
Across all apps, check 320–1920px, zoom, dark/light appearance, company switching, keyboard focus, selected states, empty/loading/error, charts, exports and colour-vision distinguishability. Text should meet WCAG AA 4.5:1 and relevant non-text indicators 3:1. Colour alone cannot convey a business state. Do not hide errors in transient toasts.
