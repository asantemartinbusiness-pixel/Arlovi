import type { ActionDef, ScreenContext } from "@/platform/registry";

/**
 * One failure boundary for native screen actions, regardless of whether the
 * action lives in the page toolbar or its overflow menu. Never report success
 * for a rejected operation, and never let an async menu action reject silently.
 */
export async function runNativeScreenAction(
  action: Pick<ActionDef, "id" | "guard" | "run">,
  context: ScreenContext,
): Promise<boolean> {
  try {
    const blocked = action.guard?.(context);
    if (blocked) {
      context.toast("Action unavailable", blocked, "blocked");
      return false;
    }
    await action.run(context);
    return true;
  } catch (error) {
    context.toast(
      "Action could not be completed",
      error instanceof Error ? error.message : "An unexpected error occurred. No success has been confirmed.",
      "failed",
    );
    return false;
  }
}
