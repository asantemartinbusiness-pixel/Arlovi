import { expect, test } from "@playwright/test";

test("Growth directory exposes five apps and registered work-area shortcuts", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps?category=Growth");
  await expect(page.getByRole("heading", { name: "Reach, sell, serve and collaborate" })).toBeVisible();
  await expect(page.locator(".apps-directory-open")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Marketing: Campaigns" }))
    .toHaveAttribute("href", "/o/northline/market/campaigns");
  await expect(page.getByRole("link", { name: "Bookings: Calendar" }))
    .toHaveAttribute("href", "/o/northline/book/calendar");
  await expect(page.getByRole("link", { name: "Procurement: Receiving" }))
    .toHaveAttribute("href", "/o/northline/proc/receiving");
  await expect(page.getByRole("link", { name: "Portals: Portal directory" }))
    .toHaveAttribute("href", "/o/northline/portal/portals");

  await page.getByRole("link", { name: "Commerce: Orders" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/commerce\/orders$/);
  const sidebar = page.getByRole("navigation", { name: "Commerce navigation" });
  await expect(sidebar.getByRole("link", { name: "All applications" }))
    .toHaveAttribute("href", "/o/northline/workspace/apps?category=Growth");
  // Tablet/mobile sidebar is a drawer; make it visible before interacting.
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  if (await openNavigation.isVisible()) await openNavigation.click();
  await sidebar.getByText("Other Growth apps").click();
  await expect(sidebar.getByRole("link", { name: "Marketing" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Marketing" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/market\/home$/);
});

test("Growth app entry screens offer native work areas without synthetic record links", async ({ page }) => {
  await page.goto("/o/northline/market/home");
  const overview = page.getByRole("region", { name: "Marketing & Growth workflow shortcuts" });
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("link", { name: "Content calendar" }))
    .toHaveAttribute("href", "/o/northline/market/calendar");
  await expect(overview.getByRole("link", { name: "Explore products and orders" }))
    .toHaveAttribute("href", "/o/northline/commerce/home");

  await page.goto("/o/northline/portal/portals");
  const portal = page.getByRole("region", { name: "Client & Partner Portals workflow shortcuts" });
  await expect(portal).toBeVisible();
  await expect(portal.getByText(/Choose a portal below/)).toBeVisible();
  await expect(portal.locator("a[href*=':id']")).toHaveCount(0);
});

for (const width of [390, 820, 1440]) {
  test(`Growth directory and overview fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/workspace/apps?category=Growth");
    await expect(page.getByRole("heading", { name: "Reach, sell, serve and collaborate" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Procurement: Purchase orders" })).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.goto("/o/northline/book/home");
    await expect(page.getByRole("region", { name: "Bookings & Capacity workflow shortcuts" })).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("Growth detail URLs never show a different record when the requested ID is missing", async ({ page }) => {
  const paths = [
    "/market/campaigns/missing-growth-campaign",
    "/commerce/products/missing-growth-product",
    "/commerce/orders/missing-growth-order",
    "/book/bookings/missing-growth-booking",
    "/proc/suppliers/missing-growth-supplier",
    "/portal/portals/missing-growth-portal/dashboard",
  ];
  for (const path of paths) {
    await page.goto(`/o/northline${path}`);
    await expect(page.getByRole("heading", { name: "Record not found" })).toBeVisible();
    await expect(page.getByText("No other record was substituted.", { exact: false })).toBeVisible();
  }
});

test("Marketing Campaign Library has searchable portfolio and card/list views", async ({ page }) => {
  await page.goto("/o/northline/market/campaigns");
  await expect(page.getByRole("heading", { name: "Every campaign, one place" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Campaign portfolio" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search campaigns" });
  await search.fill("Clerkenwell");
  await expect(page.getByRole("status").filter({ hasText: "1 of" })).toBeVisible();
  // The portfolio grid keeps a hidden mobile card beside each table row; assert the visible one.
  await expect(page.getByText("Clerkenwell open studio", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole("group", { name: "Campaign layout" }).getByRole("button", { name: "Cards" }).click();
  await expect(page.getByRole("list", { name: "All campaign cards" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clerkenwell open studio" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Winter trade list 2026" }) })).toBeVisible();
  await page.getByRole("tab", { name: "Draft" }).click();
  await expect(page.getByRole("link", { name: "Drift Pendant launch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Winter trade list 2026" })).toHaveCount(0);
});

for (const width of [390, 820, 1440]) {
  test(`Marketing campaign portfolio fits without document overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/market/campaigns");
    await expect(page.getByRole("heading", { name: "Every campaign, one place" })).toBeVisible();
    await page.getByRole("group", { name: "Campaign layout" }).getByRole("button", { name: "Cards" }).click();
    await expect(page.getByRole("list", { name: "All campaign cards" })).toBeVisible();
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(extra).toBeLessThanOrEqual(1);
    await page.getByRole("group", { name: "Campaign layout" }).getByRole("button", { name: "List" }).click();
    await expect(page.getByRole("region", { name: "Campaign portfolio" })).toBeVisible();
  });
}

test("Marketing campaign detail keeps record identity, budget and navigation across tabs", async ({ page }) => {
  await page.goto("/o/northline/market/campaigns");
  await page.getByRole("group", { name: "Campaign layout" }).getByRole("button", { name: "Cards" }).click();
  await page.getByRole("link", { name: "Winter trade list 2026" }).click();
  const summary = page.getByRole("region", { name: "Campaign plan summary" });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("heading", { name: "Winter trade list 2026" })).toBeVisible();
  await expect(summary.getByText("Delivery provider not connected")).toBeVisible();
  await page.getByRole("tab", { name: "Results" }).click();
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("link", { name: "All campaigns" }))
    .toHaveAttribute("href", "/o/northline/market/campaigns");
  await summary.getByRole("link", { name: "All campaigns" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/market\/campaigns$/);
});

test("Marketing portfolio filter recovery retains the complete screen hierarchy", async ({ page }) => {
  await page.goto("/o/northline/market/campaigns?tab=Approval");
  await expect(page.getByRole("heading", { name: "Every campaign, one place" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search campaigns" }).fill("no matching campaign name 47291");
  await expect(page.getByText("No campaigns match these filters")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Every campaign, one place" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search and channel" }).click();
  await expect(page.getByRole("heading", { name: "Every campaign, one place" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search campaigns" })).toHaveValue("");
});

test("Marketing calendar filters content by channel across its native views", async ({ page }) => {
  await page.goto("/o/northline/market/calendar?tab=List");
  await expect(page.getByRole("region", { name: "Content Calendar workspace summary" })).toBeVisible();
  const filter = page.getByRole("combobox", { name: "Filter calendar by channel" });
  await expect(filter).toHaveValue("all");
  await filter.selectOption("instagram");
  await expect(filter).toHaveValue("instagram");
  await expect(page.getByRole("group", { name: "Content calendar filters" })
    .getByRole("status")).toContainText("dated items");
  await page.getByRole("tab", { name: "By channel" }).click();
  await expect(page.getByRole("group", { name: "Content calendar filters" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Filter calendar by channel" })).toBeVisible();
});

test("Social publishing account panel can expand without hiding local status", async ({ page }) => {
  await page.goto("/o/northline/market/social?tab=Drafts");
  await expect(page.getByRole("region", { name: "Social Publishing workspace summary" })).toBeVisible();
  const connections = page.getByRole("group", { name: "Social publishing filters" });
  await expect(connections).toBeVisible();
  const accounts = page.locator(".t4-social-accounts");
  await expect(accounts).not.toHaveAttribute("open");
  await accounts.locator("summary").click();
  await expect(accounts).toHaveAttribute("open", "");
  await expect(accounts.getByRole("button", { name: "Review connection" })).toHaveCount(4);
  await connections.getByRole("combobox", { name: "Filter social posts by channel" }).selectOption("instagram");
  await expect(connections.getByRole("button", { name: "Clear channel" })).toBeVisible();
});

test("Email campaigns can be filtered by lifecycle without implying mail delivery", async ({ page }) => {
  await page.goto("/o/northline/market/email?tab=Campaigns");
  await expect(page.getByRole("region", { name: "Email Campaigns workspace summary" })).toBeVisible();
  const group = page.getByRole("group", { name: "Email campaign status filters" });
  await group.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(group.getByRole("status")).toContainText("no mail provider connected");
  await expect(page.getByText("Email preparation is local")).toBeVisible();
  await group.getByRole("button", { name: "All", exact: true }).click();
  await expect(group.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("Audience Segments allows searchable compact rules and filter recovery", async ({ page }) => {
  await page.goto("/o/northline/market/audiences?tab=Segments");
  await expect(page.getByRole("region", { name: "Audience Segments workspace summary" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search audience segments" });
  await search.fill("Trade accounts");
  await expect(page.getByRole("region", { name: "Audience segments directory" })
    .getByRole("status")).toContainText("of");
  await expect(page.getByText("Trade accounts with consent", { exact: true })).toBeVisible();
  await page.locator(".t4-audience-rules summary").first().click();
  await expect(page.locator(".t4-audience-rules[open]")).toHaveCount(1);
  await search.fill("no matching rule 39493");
  await expect(page.getByText("No segments match this view")).toBeVisible();
  await page.getByRole("button", { name: "Show all segments" }).click();
  await expect(search).toHaveValue("");
});

for (const width of [390, 820, 1440]) {
  test(`Marketing content, social, email and audience workspaces fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/market/calendar?tab=List", "/market/social", "/market/email", "/market/audiences"]) {
      await page.goto(`/o/northline${route}`);
      await expect(page.locator(".t4-workarea-head")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route).toBeLessThanOrEqual(1);
    }
  });
}
