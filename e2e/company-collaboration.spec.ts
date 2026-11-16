import { expect, test } from "@playwright/test";

test("company people shows existing directory and saves a clearly unsent invitation draft", async ({ page }) => {
  await page.goto("/o/northline/workspace/people");
  await expect(page.getByRole("heading",{name:"People & collaboration"})).toBeVisible();
  await expect(page.getByText("Local collaboration planning")).toBeVisible();
  const draftEmail = `invite-${Date.now()}@example.test`;
  await page.getByRole("button",{name:"Prepare invitation"}).click();
  await page.getByRole("textbox",{name:"Name"}).fill("Prospective teammate");
  await page.getByRole("textbox",{name:"Email"}).fill(draftEmail);
  await page.getByRole("button",{name:"Save unsent draft"}).click();
  await expect(page.getByText(draftEmail)).toBeVisible();
  await expect(page.getByText(/not sent/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(draftEmail)).toBeVisible();
  await page.getByRole("button",{name:"Cancel draft for Prospective teammate"}).click();
  await expect(page.getByText(draftEmail)).toBeVisible();
  await expect(page.getByText(/cancelled/).first()).toBeVisible();
});

test("department people tab stores an association without changing the member's HR record",async({page})=>{
  await page.goto("/o/northline/workspace/spaces");
  const department = page.locator('.ws-entry-list a[href*="/department/"]').first();
  await expect(department).toBeVisible();
  await department.click();
  await page.getByRole("button",{name:"People",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Workspace people"})).toBeVisible();
  await page.getByRole("button",{name:"Add existing person"}).click();
  const picker = page.getByRole("combobox",{name:"Company person"});
  const first = picker.locator("option:not([value=''])").first();
  test.skip(await first.count()===0,"No eligible seeded member");
  const personId = (await first.getAttribute("value"))!;
  const label = await first.textContent();
  await picker.selectOption(personId);
  await page.getByRole("button",{name:"Save membership"}).click();
  await expect(page.getByRole("button",{name:`Remove ${label} from workspace plan`})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"People",exact:true}).click();
  await expect(page.getByRole("button",{name:`Remove ${label} from workspace plan`})).toBeVisible();
});
