export const brand = {
  name: "Arlovi",
  ask: "Ask Arlovi",
  chief: "Nia Okonkwo",
  tagline: "The operating home for the company",
};

export const palettes = [
  { id: "cobalt", label: "Electric cobalt" },
  { id: "ember", label: "Ember and plum" },
  { id: "ultraviolet", label: "Ultraviolet" },
  { id: "teal", label: "Neo teal" },
  { id: "berry", label: "Electric berry" },
  { id: "carbon", label: "Carbon and citron" },
] as const;

export type PaletteId = (typeof palettes)[number]["id"];
