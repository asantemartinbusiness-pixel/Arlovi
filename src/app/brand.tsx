export const brand = {
  name: "Arlovi",
  ask: "Ask Arlovi",
  /** Working identity. The companion speaks as Arlovi until a name is cleared. */
  companion: "Arlovi",
  tagline: "The operating home for the company",
};

/**
 * Arlovi mark: three connected nodes on a rounded module — the company, its
 * people and its agents, joined. Reduced-motion safe, no animation.
 */
export function ArloviMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="arlovi-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a5cf2" />
          <stop offset="60%" stopColor="#234fe8" />
          <stop offset="100%" stopColor="#172a63" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="url(#arlovi-mark)" />
      <path d="M21 42 L32 20 L43 42" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
      <circle cx="32" cy="20" r="5" fill="#FFAE7C" />
      <circle cx="43" cy="42" r="4.5" fill="#36C5BA" />
      <circle cx="21" cy="42" r="4.5" fill="#ffffff" />
    </svg>
  );
}

export function ArloviWordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="ds-row ds-gap-2" style={{ fontWeight: 680, letterSpacing: "-0.03em", fontSize: "var(--text-md)" }}>
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
