# Arlovi — Design, Responsive, Component & Interaction Contract

## Design principle
Warm confident global technology brand; clean, approachable, exciting in marketing and creation, restrained in administration/accounting. Enterprise substance with sophisticated animations and tactile direct editing. No generic AI aesthetic, unnecessary drop shadows or high-saturation backgrounds throughout the working UI. Use platform theme and role context rather than duplicate visual systems.

## Visual foundations
- Primary Electric Cobalt `#234FE8`; Papaya `#FFAE7C`; Aqua `#36C5BA`; canvas `#F7F8FC`; dark canvas `#141A30`; primary text `#17223A`; neutral surfaces white/light slate. Create tonal ramp in OKLCH and test final WCAG contrast; these raw brand values do not automatically qualify for status text.
- Alternative brand directions: Ember & Plum, Ultraviolet, Neo Teal, Electric Berry, Carbon & Citron. Build configurable theme exploration at Settings/Appearance, but preserve semantically correct danger/warning/success palettes.
- Signature gradients: Electric Horizon cobalt→periwinkle→peach; Solar Ember plum→coral→apricot; Liquid Intelligence midnight→teal→mint. Restrict gradients to hero/AI/Studio moments.
- Logo/graphics: connected nodes, modular rounded blocks, precise living forms. Make logos/symbols independent reusable assets, accessible alt labels and reduced-motion versions.
- Type: primary Inter/Geist; 28–32px page title, 20–24px sections, 16–18px panels, 15–16px body, 13–14px dense data, 12–13px labels. Avoid tiny compulsory labels. Prose max width around 720–840px. Tabular numerals, locale-aware currency and date displays.
- Geometry: 4px spacing scale, 8–12px controls, ~16px cards; desktop page padding 32px, tablet 24px, mobile 16px; 16–24px card inset; 40–48px controls; ~44px preferred hit areas.

## Responsive shell
- Header 60px, left sidebar 248px with 64px rail; secondary app nav 208–240px; inspector 300–360px, editor toolbar 48–56px, status strip 28–32px only where useful.
- 320–599 mobile: bottom nav, overlays/full-screen sheets, one primary work region. 600–899 wide mobile/tablet: compact nav, one-to-two content columns. 900–1199: rail + main, overlay inspectors. 1200–1599 desktop: sidebar + context when appropriate. 1600+: resizable multi-pane where needed. Test 320, 375, 600, 768, 900, 1024, 1199, 1200, 1366, 1440, 1600, 1920 and height-constrained 768.
- Use CSS Grid minmax(0,1fr), container queries, logical properties, safe-area insets, dynamic viewport with fallbacks; pan/zoom editor where spatial content requires. Independent scroll areas must not hide focus/keyboard access. Mobile on-screen keyboard must not cover composer.
- Density: Comfortable, Balanced, Compact; reduce whitespace not minimum readable text. Respect zoom, large fonts, reduced-motion, high contrast and long translations.

## Global surfaces
Company header; org/brand switch; primary/sidebar/rail; app navigation; global command palette; AI composer; contextual inspector; execution tray; status bar; notification centre; accessibility settings; routing breadcrumbs; recent work; help; user/profile; error boundary; consent/permission state.

## Overlay contract
- Popover: anchored contextual options, keyboard navigable, closes safely, no clipping.
- Drawer: selected record detail, context, preserving source URL/filter, mobile as full sheet/bottom sheet.
- Modal: important short focused decision; title, explicit consequences, single principal action, escape/focus trap/return, async state; no nested modals.
- Full-page workflow: onboarding, publishing flows, dangerous security settings, complex editing; progress indicators and recoverable drafts.
- Toast: transient local result, never sole evidence of critical business action.
- Persistent notice: actionable Inbox record, not lost when toast disappears.
- Notification read ≠ approve/resolve. Emergency actions require strong contextual safeguards and policy checks.

## Interaction states and motion
Every action: focus, hover, active, disabled, busy, saved, failed, partial, offline. Motion: hover 80–140ms, menu 120–180ms, drawer 180–260ms, layout 200–320ms. Reduced motion alternatives. Drag: grip, lift, legal drop target, illegal target, settle, undo, keyboard move equivalent. Keyboard: global Ctrl/Cmd+K, Esc overlays, Ctrl/Cmd+Z in editors; avoid hotkey collision with text input. Ensure announcements use accessible live regions sparingly.

## Data visualisation
Separate series colours from semantic warning/error. Line charts label data, accessible tooltips/table equivalents, proper axes, time ranges, source freshness. Finance amounts right aligned and precision-aware. Tables support keyboard cell/row navigation, sorting/filtering/resizing, bulk actions with previews, virtualized large lists and responsive card alternatives.

## AI context and communication
Primary entry called Ask Arlovi. Agent mention autocomplete and role distinctions. Selected document/record and source scopes visible. AI action previews, authority granularity, evidence receipts, team collaboration, Mission Rooms, long-running execution states. No fabricated explanations of model hidden reasoning. External unconnected capabilities have honest stop states.

## Native UX not one-template-fits-all
Finance table and ledger; CRM pipeline and customer inspector; HR sensitive record forms; service conversation queue; Marketing calendar/asset production; Commerce product/storefront; document flow; spreadsheet 2D grid; slide deck; vector infinite canvas; image layers; video/audio timeline; web responsive block builder; app dev code+visual; automation graph; BI report dashboard. Shared shell, divergent purpose-built central work regions.
