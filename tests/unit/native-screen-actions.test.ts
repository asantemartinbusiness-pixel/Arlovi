import { describe, expect, it, vi } from "vitest";
import { runNativeScreenAction } from "@/app/screenActions";
import type { ScreenContext } from "@/platform/registry";

describe("native application action handling", () => {
  const fakeContext = () => ({
    toast: vi.fn(),
  } as unknown as ScreenContext);

  it("runs a permitted toolbar or overflow action without claiming extra results", async () => {
    const context = fakeContext();
    const run = vi.fn(async () => undefined);
    expect(await runNativeScreenAction({ id: "save", run }, context)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(context.toast).not.toHaveBeenCalled();
  });

  it("does not execute a blocked action and gives a real reason", async () => {
    const context = fakeContext();
    const run = vi.fn();
    expect(await runNativeScreenAction({ id: "post", guard: () => "Select a record first", run }, context))
      .toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledWith("Action unavailable", "Select a record first", "blocked");
  });

  it("handles rejected async overflow work without an unhandled promise or false success", async () => {
    const context = fakeContext();
    expect(await runNativeScreenAction({
      id: "export", run: async () => { throw new Error("Export could not be prepared"); },
    }, context)).toBe(false);
    expect(context.toast).toHaveBeenCalledWith(
      "Action could not be completed", "Export could not be prepared", "failed",
    );
  });

  it("handles unexpected rejection values without inventing a success message", async () => {
    const context = fakeContext();
    expect(await runNativeScreenAction({
      id: "open", run: () => Promise.reject({ reason: "unknown" }),
    }, context)).toBe(false);
    expect(context.toast).toHaveBeenCalledWith(
      "Action could not be completed",
      "An unexpected error occurred. No success has been confirmed.",
      "failed",
    );
  });

  it("also handles a guard that throws before the action starts", async () => {
    const context = fakeContext();
    const run = vi.fn();
    expect(await runNativeScreenAction({
      id: "guarded", guard: () => { throw new Error("Validation unavailable"); }, run,
    }, context)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledWith(
      "Action could not be completed", "Validation unavailable", "failed",
    );
  });
});
