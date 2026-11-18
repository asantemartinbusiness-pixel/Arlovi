import { describe, expect, it } from "vitest";
import {
  SCALE_DEFAULT, SCALE_MAX, SCALE_MIN, SCALE_VERSION,
  effectiveInterfaceScale, normaliseInterfaceScale, readInterfaceScale,
} from "@/runtime/interfaceScale";

describe("Arlovi scaling v2", () => {
  it("makes former visual 80 percent the new 100 percent default", () => {
    expect(SCALE_DEFAULT).toBe(100);
    expect(effectiveInterfaceScale(SCALE_DEFAULT)).toBeCloseTo(0.8);
    expect(readInterfaceScale(undefined, undefined)).toBe(100);
  });

  it("offers a full 0 to 100 control with a nonzero safe minimum", () => {
    expect(SCALE_MIN).toBe(0);
    expect(SCALE_MAX).toBe(100);
    expect(effectiveInterfaceScale(0)).toBeCloseTo(0.6);
    expect(effectiveInterfaceScale(25)).toBeCloseTo(0.65);
    expect(effectiveInterfaceScale(50)).toBeCloseTo(0.7);
    expect(effectiveInterfaceScale(75)).toBeCloseTo(0.75);
    expect(effectiveInterfaceScale(100)).toBeCloseTo(0.8);
    expect(effectiveInterfaceScale(0)).toBeGreaterThan(0);
  });

  it("migrates the old 75–150 slider only once", () => {
    expect(readInterfaceScale(75, undefined)).toBe(75);
    expect(readInterfaceScale(80, undefined)).toBe(100);
    expect(readInterfaceScale(100, undefined)).toBe(100);
    expect(readInterfaceScale(150, undefined)).toBe(100);
    expect(readInterfaceScale(0, SCALE_VERSION)).toBe(0);
    expect(readInterfaceScale(75, SCALE_VERSION)).toBe(75);
    expect(readInterfaceScale(100, SCALE_VERSION)).toBe(100);
  });

  it("normalises malformed settings and never renders 0 or more than the baseline", () => {
    expect(readInterfaceScale("80", undefined)).toBe(100);
    expect(readInterfaceScale(Number.NaN, SCALE_VERSION)).toBe(100);
    expect(readInterfaceScale(-5, undefined)).toBe(100);
    expect(normaliseInterfaceScale(-3)).toBe(0);
    expect(normaliseInterfaceScale(109)).toBe(100);
    expect(normaliseInterfaceScale(42)).toBe(40);
    expect(effectiveInterfaceScale(-999)).toBeCloseTo(0.6);
    expect(effectiveInterfaceScale(999)).toBeCloseTo(0.8);
  });
});
