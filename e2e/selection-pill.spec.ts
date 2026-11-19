import { expect, test } from "@playwright/test";

test("selected sidebar and tabs use the soft pink filled pills from the approved reference", async ({ page }) => {
  await page.goto("/o/northline/crm/contacts");
  const activeSidebar = page.locator('.hq-appnav .hq-navlink[aria-current="page"]').first();
  await expect(activeSidebar).toBeVisible();
  const sidebar = await activeSidebar.evaluate(element => {
    const css = getComputedStyle(element);
    return { background: css.backgroundColor, radius: css.borderRadius, shadow: css.boxShadow };
  });
  expect(sidebar.background).toBe("rgb(255, 201, 255)");
  expect(sidebar.radius).toBe("999px");
  expect(sidebar.shadow).toBe("none");
  const tab = page.locator('.ds-tab[aria-selected="true"]').first();
  await expect(tab).toBeVisible();
  expect(await tab.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 201, 255)");
  expect(await tab.evaluate(element => getComputedStyle(element).borderRadius)).toBe("999px");
});
