import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Makes a link inside an application's navigation reachable, the way a person
 * would: on tablet and phone the navigation is a drawer, and a route change
 * closes it once the new route has rendered. Open the drawer when it is
 * closed, and retry until the link is actually in view, so a close that lands
 * after the reopen is followed by another open instead of a stuck click.
 */
export async function revealInNavigation(page: Page, link: Locator): Promise<void> {
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  await expect(async () => {
    if (await open.isVisible()) await open.click();
    // A long navigation scrolls inside the drawer; only an off-canvas (closed)
    // drawer leaves the link outside the viewport after scrolling.
    await link.scrollIntoViewIfNeeded({ timeout: 1000 });
    await expect(link).toBeInViewport({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}
