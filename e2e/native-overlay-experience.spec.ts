import { expect, test } from "@playwright/test";

test("bookings deposit keeps its own identity, record and action workflow", async ({ page }) => {
  await page.goto("/o/northline/book/bookings/nl-bookings-628?clock=2026-11-14T09:30:00Z");
  await page.getByRole("button", { name: "Take payment (deposit)" }).click();
  const dialog = page.getByRole("dialog", { name: "Deposit" });
  await expect(dialog).toHaveAttribute("data-native-app", "BOOK");
  await expect(dialog.locator(".native-overlay-origin")).toContainText("Bookings");
  await expect(dialog.locator(".native-overlay-record")).toContainText("Ledbury Hotel Group");
  await expect(dialog.getByRole("button", { name: "Money received elsewhere" })).toBeVisible();
});

test("finance drawer keeps account evidence and its own application context", async ({ page }) => {
  await page.goto("/o/northline/fin/budgets?clock=2026-11-14T09:30:00Z");
  await page.getByRole("button", { name: /^Explain / }).first().click();
  const drawer = page.getByRole("dialog", { name: "Explain a variance" });
  await expect(drawer).toHaveAttribute("data-native-app", "FIN");
  await expect(drawer.locator(".native-overlay-origin")).toContainText("Finance");
  await expect(drawer.getByRole("region", { name: "Budget variance overview" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save explanation" })).toBeVisible();
});

test("an unselected automation cannot activate an arbitrary first workflow", async ({ page }) => {
  await page.goto("/o/northline/auto/workflows?overlay=activation%20review");
  const dialog = page.getByRole("dialog", { name: "Activation review" });
  await expect(dialog).toHaveAttribute("data-native-app", "AUTO");
  await expect(dialog).toContainText("Choose a record first");
  await expect(dialog.getByRole("button", { name: /^Activate$/ })).toHaveCount(0);
});

test("cancelling an edited receipt asks whether to discard changes", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices/nl-invoices-001?overlay=payment%20form");
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Amount received" }).fill("1.00");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  const confirm = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep editing" }).last().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Amount received" })).toHaveValue("1.00");
});

test("an invoice receipt refuses a booking ID instead of showing a different invoice", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices/nl-bookings-001?overlay=payment%20form");
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The selected record is unavailable");
  await expect(dialog.getByRole("button", { name: "Post the receipt" })).toHaveCount(0);
});

test("a finance reversal cannot target an arbitrary ledger entry", async ({ page }) => {
  await page.goto("/o/northline/fin/ledger?overlay=reverse%20confirmation");
  const dialog = page.getByRole("dialog", { name: "Reverse a posted journal" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Choose a record first");
  await expect(dialog.getByRole("button", { name: "Post the reversal" })).toHaveCount(0);
});

test("a CRM merge requires two explicitly chosen companies", async ({ page }) => {
  await page.goto("/o/northline/crm/companies?overlay=merge%20preview");
  const drawer = page.getByRole("dialog", { name: "Merge two accounts" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("combobox", { name: "Keep this account" })).toBeVisible();
  await expect(drawer.getByRole("combobox", { name: "Merge this account into it" })).toBeVisible();
  await expect(drawer).toContainText("Two different active company records are required");
  await expect(drawer.getByRole("button", { name: "Review and merge" })).toBeDisabled();
});

test("a document sharing drawer never silently chooses a document", async ({ page }) => {
  await page.goto("/o/northline/docs/files?overlay=sharing");
  const drawer = page.getByRole("dialog", { name: "Sharing" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Choose a record first");
  await expect(drawer.getByRole("button", { name: "Record sharing instruction" })).toHaveCount(0);
});

test("a design export is tied to a real page and reports its output format", async ({ page }) => {
  await page.goto("/o/northline/design/files/nl-designs-001?overlay=export");
  const dialog = page.getByRole("dialog", { name: "Export this page" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "File format" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Image resolution" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Download PNG" })).toBeEnabled();
  await dialog.getByRole("combobox", { name: "File format" }).selectOption("svg");
  await expect(dialog.getByRole("button", { name: "Download SVG" })).toBeEnabled();
  await expect(dialog.getByRole("combobox", { name: "Image resolution" })).toHaveCount(0);
});

test("a stock movement requires an explicit product and warehouse", async ({ page }) => {
  await page.goto("/o/northline/proc/movements?overlay=authorization");
  const dialog = page.getByRole("dialog", { name: "Authorise stock movement" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Product" })).toHaveValue("");
  await expect(dialog.getByRole("combobox", { name: "Warehouse" })).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Record stock movement" })).toBeDisabled();
  await expect(dialog).toContainText("No inventory provider is connected");
});

test("procurement approval does not silently use the first requisition", async ({ page }) => {
  await page.goto("/o/northline/proc/home?overlay=Requisition");
  const drawer = page.getByRole("dialog", { name: "Requisition review" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Choose a requisition to review");
  await expect(drawer.getByRole("button", { name: "Approve requisition" })).toHaveCount(0);
});

test("emergency revocation requires scope and typed confirmation", async ({ page }) => {
  await page.goto("/o/northline/admin/security?overlay=emergency%20revoke");
  const dialog = page.getByRole("dialog", { name: "Revoke sessions" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Revocation scope" })).toHaveValue("none");
  await expect(dialog.getByRole("button", { name: /Record revocation/ })).toBeDisabled();
  await expect(dialog).toContainText("No identity provider is connected");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("signature handover never substitutes an approved contract without selection", async ({ page }) => {
  await page.goto("/o/northline/legal/contracts?overlay=e-sign%20request");
  const dialog = page.getByRole("dialog", { name: "Signature handover" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Choose a contract ready for signature");
  await expect(dialog.getByRole("button", { name: "Mark awaiting signature" })).toHaveCount(0);
});

test("People payroll run review requires explicit selection", async ({ page }) => {
  await page.goto("/o/northline/hr/payroll?overlay=Payroll%20review");
  const drawer = page.getByRole("dialog", { name: "Payroll evidence" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Choose a payroll run to review");
  await expect(drawer.getByRole("combobox", { name: "Company payroll run" })).toHaveValue("");
  await expect(drawer.getByRole("grid", { name: "Illustrative current employee salary breakdown" })).toHaveCount(0);
});

test("payroll human approval cannot select the first draft automatically", async ({ page }) => {
  await page.goto("/o/northline/hr/payroll?overlay=submission%20signoff");
  const dialog = page.getByRole("dialog", { name: "Payroll human approval" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Choose the draft payroll run");
  await expect(dialog.getByRole("button", { name: "Approve local draft" })).toHaveCount(0);
});

test("Customer Care bulk routing requires a named owner and review", async ({ page }) => {
  await page.goto("/o/northline/care/tickets?overlay=bulk%20assignment");
  const dialog = page.getByRole("dialog", { name: "Route unassigned cases" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Assign every listed case to" })).toHaveValue("");
  await expect(dialog.getByRole("button", { name: /Assign \d+ cases/ })).toBeDisabled();
  await expect(dialog).toContainText("Their conversation history, queue, priority and existing SLA remain unchanged");
});
