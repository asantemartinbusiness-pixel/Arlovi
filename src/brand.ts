export const brand = {
  name: "Arlovi",
  ask: "Ask Arlovi",
  chief: "Nia Okonkwo",
  tagline: "The operating home for the company",
};

export const palettes = [
  { id: "seafoam", label: "Seafoam", color: "#2D6B65", soft: "#D7F0E8" },
  { id: "sage", label: "Sage Milk", color: "#3F624D", soft: "#DDEDDC" },
  { id: "lilac", label: "Lilac Cloud", color: "#5D4B84", soft: "#E9DFFA" },
  { id: "butter", label: "Buttercream", color: "#6E5C28", soft: "#FFF0C8" },
  { id: "peach", label: "Peach Cream", color: "#805137", soft: "#FCE7D6" },
  { id: "mulberry", label: "Mulberry", color: "#7C2D58", soft: "#EFC9D9" },
  { id: "terracotta", label: "Terracotta", color: "#A14F36", soft: "#F2D9C9" },
  { id: "forest", label: "Forest", color: "#41631A", soft: "#DDE9CC" },
  { id: "monochrome", label: "Monochrome", color: "#29372E", soft: "#DDDADD" },
] as const;

export type PaletteId = (typeof palettes)[number]["id"];
