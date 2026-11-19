import { expect, test } from "@playwright/test";

for (const width of [390, 820, 1440]) {
  test("persistent toast copy does not block work controls at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/o/northline/connect/marketplace");
    await page.getByLabel("Guided integration setup").waitFor();

    await page.evaluate(() => {
      const underlying = document.createElement("button");
      underlying.textContent = "Underlying work action";
      underlying.type = "button";
      underlying.setAttribute("data-testid", "under-toast");
      underlying.style.cssText = "position:fixed;bottom:115px;right:30px;width:215px;height:40px;z-index:90";
      underlying.addEventListener("click", () => underlying.setAttribute("data-clicked", "yes"));
      document.body.appendChild(underlying);
      const stack = document.createElement("div");
      stack.className = "nt-toast-stack ds-toasts";
      stack.setAttribute("aria-label", "Application status messages");
      stack.innerHTML = '<section class="nt-toast ds-toast" role="status"><p>Persistent message is readable.</p><button type="button">Dismiss message</button></section>';
      document.body.appendChild(stack);
    });

    const toast = page.locator(".nt-toast").last();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCSS("pointer-events", "none");
    await expect(toast.getByRole("button", { name: "Dismiss message" })).toHaveCSS("pointer-events", "auto");
    await page.getByTestId("under-toast").click();
    await expect(page.getByTestId("under-toast")).toHaveAttribute("data-clicked", "yes");
  });
}
