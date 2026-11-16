import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowsSpeculation, IntentPrefetchController } from "@/app/nativePrefetch";

describe("demand-based app speculation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("blocks data saving, limited bandwidth, offline and hidden-tab prefetch", () => {
    expect(allowsSpeculation({ saveData: true })).toBe(false);
    expect(allowsSpeculation({ effectiveType: "3g" })).toBe(false);
    expect(allowsSpeculation({ downlink: 1.2 })).toBe(false);
    expect(allowsSpeculation(undefined, false, true)).toBe(false);
    expect(allowsSpeculation(undefined, true, false)).toBe(false);
    expect(allowsSpeculation({effectiveType:"4g",downlink:10})).toBe(true);
  });

  it("does not fetch on momentary hover, but fetches after sustained intent", async () => {
    const load=vi.fn(async (_code:string) => undefined);
    const controller=new IntentPrefetchController(load, () => true);
    controller.schedule("FIN");
    await vi.advanceTimersByTimeAsync(80);
    controller.cancel();
    await vi.advanceTimersByTimeAsync(300);
    expect(load).not.toHaveBeenCalled();
    controller.schedule("FIN");
    await vi.advanceTimersByTimeAsync(180);
    expect(load).toHaveBeenCalledExactlyOnceWith("FIN");
    controller.dispose();
  });

  it("switches a pending navigation hint and never prefetches both", async () => {
    const load=vi.fn(async (_code:string) => undefined);
    const controller=new IntentPrefetchController(load, () => true);
    controller.schedule("CRM");
    await vi.advanceTimersByTimeAsync(100);
    controller.schedule("DOCS");
    await vi.advanceTimersByTimeAsync(180);
    expect(load).toHaveBeenCalledExactlyOnceWith("DOCS");
    controller.dispose();
  });

  it("limits speculative work to one in-flight import", async () => {
    let finish=() => {};
    const load=vi.fn(() => new Promise<void>(resolve=>{finish=resolve;}));
    const controller=new IntentPrefetchController(load,()=>true);
    controller.schedule("DOCS",0);
    await vi.advanceTimersByTimeAsync(0);
    controller.schedule("SHEETS",0);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    controller.dispose();
  });

  it("does not fetch after disposal or when connection policy changes", async () => {
    let allowed=true;
    const load=vi.fn(async (_code:string) => undefined);
    const controller=new IntentPrefetchController(load,()=>allowed);
    controller.schedule("PROJECT");
    allowed=false;
    await vi.advanceTimersByTimeAsync(200);
    expect(load).not.toHaveBeenCalled();
    allowed=true;
    controller.schedule("PROJECT");
    controller.dispose();
    await vi.advanceTimersByTimeAsync(250);
    expect(load).not.toHaveBeenCalled();
  });
});
