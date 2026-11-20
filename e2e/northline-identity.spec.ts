import { expect, test } from "@playwright/test";

test("Northline flagship uses the supplied paper-acid type and colour system", async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/northline-collective/");
  const hero=page.locator(".hero");
  const art=page.locator(".hero-cover-art");
  await expect(page.getByRole("heading",{name:/Material.*Space.*Experience/})).toBeVisible();
  await expect(art).toBeVisible();
  const metrics=await hero.evaluate(element=>{
    const style=getComputedStyle(element);
    const columns=style.gridTemplateColumns.split(" ").map(Number.parseFloat);
    return {display:style.display,columns};
  });
  expect(metrics.display).toBe("grid");
  expect(metrics.columns).toHaveLength(2);
  const ratio=metrics.columns[0]/(metrics.columns[0]+metrics.columns[1]);
  expect(ratio).toBeGreaterThan(.46);
  expect(ratio).toBeLessThan(.5);
  await expect(page.locator(".paper-slip")).toHaveCount(2);
  await expect(page.locator(".mosaic-grid")).toBeVisible();
  const primary=page.locator(".hero-cta");
  await expect(primary).toHaveCSS("background-color","rgb(223, 255, 63)");
  await expect(primary).toHaveCSS("border-top-left-radius","0px");
});

for(const width of [390,820,1440]){
  test("Northline site reflows cleanly at "+width+"px",async ({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto("/northline-collective/");
    await expect(page.locator(".hero-cover-art")).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const art=await page.locator(".hero-cover-art").boundingBox();
    expect(art?.width).toBeGreaterThan(0);
    expect(art?.height).toBeGreaterThan(300);
  });
}

test("original 60-second motion study supports chapter selection, scrub, restart and pause",async ({page})=>{
  await page.goto("/northline-collective/film.html");
  await expect(page.getByRole("heading",{name:/Ways of living/})).toBeVisible();
  await expect(page.locator(".scene.active")).toHaveCount(1);
  await page.getByRole("button",{name:/Space/}).click();
  await expect(page.locator(".scene-space")).toHaveClass(/active/);
  await expect(page.locator("#clock")).toContainText("00:15");
  await page.locator("#seek").evaluate(element=>{
    const input=element as HTMLInputElement; input.value="47";
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await expect(page.locator(".scene-final")).toHaveClass(/active/);
  await page.getByRole("button",{name:/Restart/}).click();
  await expect(page.locator("#clock")).toContainText("00:00");
  await page.getByRole("button",{name:/Play motion study/}).click();
  await expect(page.getByRole("button",{name:/Pause motion study/})).toBeVisible();
  await page.getByRole("button",{name:/Pause motion study/}).click();
  await expect(page.getByRole("button",{name:/Play motion study/})).toBeVisible();
});

test("native Northline hub points to the authored film and respects paper-acid visuals",async ({page})=>{
  await page.goto("/o/northline/workspace/showcase");
  const link=page.getByRole("link",{name:/Watch original motion study/});
  await expect(link).toHaveAttribute("href","/northline-collective/film.html");
  const hero=page.locator(".fs-hero");
  await expect(hero).toHaveCSS("border-top-left-radius","0px");
  await expect(page.locator(".fs-slip")).toHaveCount(2);
});
