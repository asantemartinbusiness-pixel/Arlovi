/** Select legible text on tenant-owned company accent swatches.
 * Custom colours never override Arlovi's status, workspace or navigation tokens.
 */
export function foregroundOnBrand(hex: string): "#000000" | "#FFFFFF" {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#FFFFFF";
  const linear = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const onWhite = 1.05 / (luminance + 0.05);
  const onBlack = (luminance + 0.05) / 0.05;
  return onWhite >= onBlack ? "#FFFFFF" : "#000000";
}
