export const brand = {
  name: "Arlovi",
  ask: "Ask Arlovi",
  /** Working identity. The companion speaks as Arlovi until a name is cleared. */
  companion: "Arlovi",
  tagline: "The operating home for the company",
};

/**
 * Arlovi mark: one route joining three nodes — people, agents and the books —
 * on an ink disc. Reduced-motion safe, no animation.
 */
export function ArloviMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title && <title>{title}</title>}
      <rect width="64" height="64" rx="32" fill="#0d0d0d" />
      <path d="M18 43 C26 43 26 21 34 21 H46" fill="none" stroke="#ffc9ff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="18" cy="43" r="6" fill="#ffffff" />
      <circle cx="34" cy="21" r="5" fill="#36C5BA" />
      <circle cx="47" cy="21" r="5" fill="#FFAE7C" />
    </svg>
  );
}

export function ArloviWordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="ds-row ds-gap-2" style={{ fontWeight: 500, letterSpacing: "-0.02em", fontSize: "var(--text-lg)" }}>
      <ArloviMark size={26} />
      {!compact && <span>Arlovi</span>}
    </span>
  );
}

export const palettes = [
  { id: "cobalt", label: "Electric cobalt" },
  { id: "ember", label: "Ember and plum" },
  { id: "ultraviolet", label: "Ultraviolet" },
  { id: "teal", label: "Neo teal" },
  { id: "berry", label: "Electric berry" },
  { id: "carbon", label: "Carbon and citron" },
] as const;

export type PaletteId = (typeof palettes)[number]["id"];
