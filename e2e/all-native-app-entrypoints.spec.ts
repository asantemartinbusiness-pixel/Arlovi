import { expect, test } from "@playwright/test";

/** Every native tool should launch from the same company-scoped directory.
 * Test actual links rather than a manually maintained sample-path list.
 */
const groups = [
  {name: "Headquarters", count: 4},
  {name: "Intelligence", count: 6},
  {name: "Operations", count: 7},
  {name: "Growth", count: 5},
  {name: "Studio", count: 8},
  {name: "Platform", count: 5},
];

for (const group of groups) {
  test(group.name + " native apps all launch from the shared directory", async ({page}) => {
    test.setTimeout(120_000);
    await page.goto("/o/northline/workspace/apps?category=" + group.name);
    const launchers = page.locator(".apps-directory-open");
    await expect(launchers).toHaveCount(group.count);
    const paths = await launchers.evaluateAll(nodes =>
      nodes.map(node => node.getAttribute("href")).filter((path): path is string => Boolean(path)),
    );
    expect(paths).toHaveLength(group.count);
    for (const path of paths) {
      expect(path).toMatch(/^\/o\/northline\//);
      expect(path).not.toMatch(/:id|:slug|:org/);
      await page.goto(path);
      const nativeNav = page.locator(".hq-appnav");
      await expect(nativeNav, path).toBeVisible({ timeout: 30_000 });
      await expect(nativeNav.getByRole("link", {name: "All applications"})).toBeVisible();
      await expect(page.getByText("Some applications could not be loaded")).toHaveCount(0);
    }
  });
}
