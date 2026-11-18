import { describe, expect, it } from "vitest";
import { foregroundOnBrand } from "../../src/design-system/brandColor";

function luminance(hex: string) {
  const channels = [1,3,5].map(i => {
    const n = parseInt(hex.slice(i,i+2),16)/255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n+0.055)/1.055,2.4);
  });
  return channels[0]*0.2126 + channels[1]*0.7152 + channels[2]*0.0722;
}
function contrast(a: string,b: string) {
  const levels = [luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (levels[0]+0.05)/(levels[1]+0.05);
}
describe("Seafoam visual governance", () => {
  it("uses legible text on light or dark tenant identity swatches", () => {
    for (const bg of ["#D7F0E8","#FFFFFF","#000000","#2D6B65","#E9DFFA","#FF00FF","#777777"]) {
      expect(contrast(foregroundOnBrand(bg),bg), bg).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps Seafoam's action foreground readable on white", () => {
    expect(contrast("#2D6B65","#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#174A44","#FFFFFF")).toBeGreaterThanOrEqual(7);
  });
  it("does not accept malformed custom colours as selectors", () => {
    expect(foregroundOnBrand("evil-code")).toBe("#FFFFFF");
  });
});
