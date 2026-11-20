# Northline Collective — Brand Identity & Experience System
**Version:** 1.0 / flagship simulation / November 2026  
**Scope:** `northline` demo only. Arlovi OS and unrelated demo organisations retain their own design systems.

## Creative basis and ownership
This system is adapted to Northline from the **user-supplied** reference titled “Strut — paper meets acid”. The reference is a visual-language and component specification, not permission to adopt that product's name, marks, copyrighted artwork, prose, pricing, customer claims or proprietary designs.

Northline's identity is an original interpretation called **The Working Paper**: a physical record of ideas being drawn, reviewed, tested, revised and delivered. The mark `N/C`, business lines (Atelier, Supply, Experiences), invented portfolio and all on-site copy belong to this fictional Arlovi reference company.

**Core thought:** “Material. Space. Experience.”  
**Working headline:** “Made for the way we live.”  
**Product-specific metaphor:** a studio table covered with design fragments — material samples, delivery annotations, sketches, folded shapes and approved work.

## Colour tokens

These canonical values are exported by `src/domain/flagship/identity.ts`. Site CSS and native showcase should use the same semantic choices; never globally override Arlovi's tokens.

| Token | HEX | Primary use |
| --- | --- | --- |
| Acid | `#dfff3f` | Single strong action, direction mark, focused highlights |
| Paper | `#f3f0e8` | Default marketing canvas, physical notes |
| Ink | `#151515` | Headline, button contrast, 1px outlines |
| Night | `#111111` | Closing/footer |
| Stage | `#171717` | Film and project-demo chapters |
| Violet | `#7e57ff` | Singular major feature panel and collage fragment |
| Apricot | `#e6a868` | Joined material practice tile |
| Blue paper | `#b8d8fe` | Joined experience/knowledge tile |
| Seam | `#cbc7bd` | Hairline separators and reading lists |
| Body | `#4f4d48` | Explanatory text |
| Yellow copy | `#3f4033` | Text against acid fields |
| White | `#ffffff` | Clean utility cards |
| Citron tint | `#fbffe0` | Comparison or selected scenario |

The editorial duotone-only set: orange `#f47b31`, blue `#3478f6`, green `#a8c91a`, teal `#0fb69b`, pink `#ed5b92`. It is **not** a rainbow navigation palette.

## Typography and hierarchy
- **Manrope 700** — brand primary display, `clamp(58px,6.4vw,104px)`, line-height `0.88`, tracking `-.075em`.
- **Newsreader 500 italic** — a single meaningful phrase *within* the primary display; retain the same line box and size.
- **Manrope 700** — section leads `clamp(42px,5vw,76px)`, line-height `0.95`, tracking `-.06em`.
- **DM Mono 400** — labels, folios, annotations, `10px/1.3`, tracking `.12em`. Never enlarge into a technical-display effect.
- **Manrope 400** — ordinary marketing body at `16px/1.65`, compact UI at `13px`.
- **Georgia 400** — extended magazine-style reading `19px/1.8`. Avoid in menus, buttons and navigation.

Hosted web typography may load from Google Fonts; resilient stacks remain for missing fonts. Embedded/local font files are not redistributed.

## Building the public experience

### Homepage
1. 72px warm translucent navigation, brand left, links centre, 41px dark action right.
2. A full editorial cover with cream 48% text and tactile collage 52% at desktop. Do not shrink collage to a postcard.
3. The opening design has an original SVG collage: fibrous/stacked paper, charcoal fold, violet shape, graphite pathways, separate acid stroke, two HTML note slips. Each slip has 22px padding and the hard `8px 10px` offset shadow.
4. The process and portfolio sections are airy; details and annotations are dense. Give important projects adequate scale.
5. A joined violet / white / apricot / blue product mosaic, without soft floating cards.
6. A separate dark work/film chapter, bright acid conversion band and substantial night footer.
7. No full-colour stock-photo collage pretending to be commissioned photography. Original photography must have a documented licence/consent.

### Native Arlovi simulation
- Scope branded presentation surfaces to the Northline flagship; **not** global Arlovi UI.
- The showcase's source-file cards use square panels, ruled boundaries and coherent link affordances.
- Mark editable Design, Layout, Forms and Film records as local / fictional / unreviewed until genuinely approved.
- The source brand palette is seeded in the native brand record; vector files, editorial book, native website and forms follow the same palette.
- Preserve native application interaction semantics: keyboard navigation, readable data grids, inline permission messaging and reversible user actions matter more than visual novelty.

### Buttons and panels
- Compact acid button: 41px height, `13px 18px` padding, black text, 1px border, 0px radius.
- Nav dark button: ink fill, white text, same dimensions.
- Conversion action: 58px height, `20px 26px` padding.
- Supporting link: underline, text arrow on the baseline, no decorative icon badge.
- Utility card: white background, 1px ink rule, 0px radius, no glow and no elevation.
- Hard offset shadow is exclusive to physical collage notes, not ordinary UI panels.
- Every dark and acid control uses an explicit 3px high-contrast keyboard focus ring.

## Art direction — original production
- **Editorial graphics:** origami-like folded shapes, physical cards, scribbles, transparent tracing sheets, ink.
- **Product art:** original object silhouettes and annotated specs; do not call abstract SVG a real product photo.
- **Case studies:** separate “Concept”, “In production”, and “Delivered” provenance.
- **Film:** `public/northline-collective/film.html` is an original, 60-second interactive vector motion study with four chapters; it is not an MP4, a photo film, or an executed native Video export.
- **Native Video:** `nl-videos-910` is an editable, proxy-backed local timeline with separate editorial notes. No synchronisation or export receipt is claimed between the video and the public browser study.

## Responsive and accessibility
- On narrow devices, stack text before a still-substantial collage. Keep notes legible, with no horizontal overflow.
- Convert joined grids to ruled vertical stacks. Do not add rounded cards.
- Reflow mixed display typography while retaining inline italic emphasis.
- Honour `prefers-reduced-motion:reduce` across the site, motion study and native showcase.
- Maintain semantic headings, anchor destinations, keyboard controls and visible focus treatments.
- Never make crucial information dependent exclusively on colour, motion, or hover.

## Content principles
Use precise language: “Request a studio consultation”; “Review the material concept”; “Explore the editable portfolio”; “Draft a project brief”. Avoid nonspecific futurist claims, invented client quotes, fake stock images or fake account authentication.

**Boundaries always near actions:** the website form exports an offline text brief. No message is sent. Finance figures are planning scenarios, not verified actuals. All e-commerce orders, supplier payment requests and invoices are clearly unposted drafts.

## Validation matrix
1. Public website at 390, 820, 1440 and 1920px: split at desktop, stacked mobile, no overflow.
2. Mobile menu, keyboard focus, form validation and correct local export.
3. Original motion stage at 390, 820 and 1440px; pause/resume/scrub/restart work, reduced motion respected.
4. Native showcase deep links open actual editable records and respect organisation context.
5. Native Studio scene graph, publishing stories, video clips and image provenance pass unit tests.
6. All financial scenarios carry `fictional:true`, `scenarioOnly:true`, `ledgerPosted:false`; no external confirmations.
7. Review images, fonts, permission states, broken links and Vercel preview in a real browser before merging.

**Production release is gated by QA sign-off.** Do not claim the entire 35-app customer simulation or all creative media are complete merely because fixtures exist.
