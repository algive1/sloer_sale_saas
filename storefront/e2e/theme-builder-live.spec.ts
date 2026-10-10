import { expect, test, request as playwrightRequest } from "@playwright/test";
import { FASHION_TEMPLATE, JEWELRY_TEMPLATE, type ThemeData } from "../src/plugins/theme-builder/template";
import { PRODUCT_DETAIL_TEMPLATE } from "../src/plugins/theme-builder/page-document";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const password = process.env.PLAYWRIGHT_THEME_EDITOR_SECRET;
const channel = "us";
const locale = "en";
const scope = `/ops/themes/api?channel=${channel}&locale=${locale}`;
const home = "/en/us";

test.describe("live editor -> libSQL -> published Saleor homepage", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("protected editor writes and homepage publishing with real SQLite persistence", async ({ browser }) => {
    const resetToken = process.env.PLAYWRIGHT_THEME_DB_RESET_TOKEN;
    test.skip(!password || !resetToken, "Requires the isolated CI theme editor and database credentials");
    // Retry-safe isolation: a prior Playwright attempt may have successfully
    // published a page before a later assertion failed.
    const fixture = await playwrightRequest.newContext({
      baseURL: "http://127.0.0.1:3789",
      extraHTTPHeaders: { Authorization: "Bearer " + resetToken },
    });
    try {
      const reset = await fixture.post("/__test__/reset", { data: {} });
      expect(reset.status(), await reset.text()).toBe(200);
    } finally {
      await fixture.dispose();
    }
    const unauth = await playwrightRequest.newContext({ baseURL });
    const blocked = await unauth.get(scope);
    expect(blocked.status()).toBe(401);
    // New editor catalog endpoints must remain behind the same operations boundary.
    const blockedCatalog = await unauth.get("/ops/themes/catalog?kind=collections&channel=us");
    expect(blockedCatalog.status()).toBe(401);
    await unauth.dispose();

    const authorized = await playwrightRequest.newContext({
      baseURL,
      httpCredentials: { username: "analytics", password: password! },
    });
    const context = await browser.newContext({
      httpCredentials: { username: "analytics", password: password! },
      viewport: { width: 1366, height: 860 },
    });
    const page = await context.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("requestfailed", request => browserErrors.push("Request failed: " + request.url() + " " + (request.failure()?.errorText || "")));
    async function requirePuckPublishButton() {
      const publish = page.getByRole("button", { name: "发布上线", exact: true }).first();
      try {
        await expect(publish).toBeVisible({ timeout: 30_000 });
      } catch (error) {
        throw new Error(
          "Our accessible Publish button did not mount. " + String(error) +
          "\\nCurrent URL: " + page.url() +
          "\\nPage content: " + (await page.locator("body").innerText().catch(() => "")).slice(0, 3500) +
          "\\nBrowser errors: " + browserErrors.join("\\n").slice(0, 3500),
        );
      }
      return publish;
    }

    try {
      const response = await authorized.get(scope);
      expect(response.ok()).toBe(true);
      const original = await response.json() as {
        draft: ThemeData | null; published: ThemeData | null; draftRevision: number;
      };
      expect(original.draft).toBeNull();
      expect(original.published).toBeNull();
      expect(original.draftRevision).toBe(0);

      await page.goto("/ops/themes");
      await expect(page.getByRole("heading", { name: "品牌网站装修" })).toBeVisible();
      // The Puck editor must hydrate; the Publish control is outside its canvas iframe.
      await requirePuckPublishButton();
      // Confirm the actual Puck block sidebar mounted, not just our server shell.
      await expect(page.getByText("商品集合", {exact:true}).first()).toBeVisible({timeout:30_000});
      // Verify the editor preview API pulls actual Saleor merchandise from this Channel.
      const actualCollection = await authorized.get(
        "/ops/themes/catalog?kind=collection-products&channel=us&slug=featured-products",
      );
      expect(actualCollection.status(), await actualCollection.text()).toBe(200);
      const merchandise = await actualCollection.json() as {
        collection: {slug:string;products:{slug:string;image:string|null;price:{amount:number;currency:string}|null}[]}|null;
      };
      expect(merchandise.collection?.slug).toBe("featured-products");
      expect(merchandise.collection?.products.length).toBeGreaterThan(0);
      expect(actualCollection.headers()["cache-control"]).toContain("no-store");
      // Smoke-test both operator single-product and searchable catalog queries
      // against real Saleor, not just mocked Vitest GraphQL fixtures.
      const firstProduct = merchandise.collection?.products[0];
      expect(firstProduct?.slug).toBeTruthy();
      const selected = await authorized.get(
        "/ops/themes/catalog?kind=product&channel=us&slug=" + encodeURIComponent(firstProduct!.slug),
      );
      expect(selected.status(), await selected.text()).toBe(200);
      const selectedBody = await selected.json() as {item:{slug:string;name:string;image:string|null}|null};
      expect(selectedBody.item?.slug).toBe(firstProduct!.slug);
      const search = await authorized.get(
        "/ops/themes/catalog?kind=products&channel=us&q=" + encodeURIComponent(selectedBody.item!.name),
      );
      expect(search.status(), await search.text()).toBe(200);
      const searchBody = await search.json() as {items:{slug:string}[]};
      expect(searchBody.items.some(item=>item.slug===firstProduct!.slug)).toBe(true);


      const draft = structuredClone(FASHION_TEMPLATE);
      draft.content[0].props.heading = "THE CI FASHION STORY";
      draft.content[1].props.heading = "THE CI PRODUCT EDIT";

      const malformed = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: { channel, locale, action: "publish", data: {
          root: {props: {}}, content: [{type:"RawHtml", props: {id:"unsafe",html:"<script>evil()</script>"}}],
        }, expectedRevision: 0 },
      });
      expect(malformed.status()).toBe(400);

      const wrongScope = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: { channel: "not-a-store", locale, action: "draft", data:draft, expectedRevision:0 },
      });
      expect(wrongScope.status()).toBe(400);

      const saveDraft = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: { channel, locale, action: "draft", data: draft, expectedRevision: 0 },
      });
      expect(saveDraft.status(), await saveDraft.text()).toBe(200);
      expect((await saveDraft.json()).draftRevision).toBe(1);

      const draftResponse = await authorized.get(scope);
      const draftState = await draftResponse.json() as {
        draft: ThemeData | null; published: ThemeData | null; draftRevision: number;
      };
      expect(draftState.draft?.content[0].props.heading).toBe("THE CI FASHION STORY");
      expect(draftState.published).toBeNull();
      expect(draftState.draftRevision).toBe(1);

      // A draft never modifies the customer-facing homepage.
      await page.goto(home);
      await expect(page.getByRole("heading", { name: "THE CI FASHION STORY" })).toHaveCount(0);

      const stale = await authorized.put("/ops/themes/api", {
        headers: { Origin: baseURL },
        data: {channel, locale, action:"publish", data:draft, expectedRevision:0},
      });
      expect(stale.status()).toBe(409);

      const foreign = await authorized.put("/ops/themes/api", {
        headers: { Origin: "https://attacker.invalid" },
        data: {channel, locale, action:"publish", data:draft, expectedRevision:1},
      });
      expect(foreign.status()).toBe(403);

      // Publish through our accessible toolbar connected to the real Puck document state.
      // Reload first so it picks up the persisted draft and revision #1.
      await page.goto("/ops/themes");
      await requirePuckPublishButton();
      // Publishing is a business-impacting action. Cancel must never change
      // the live homepage or the pending draft revision.
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("us / en");
        await dialog.dismiss();
      });
      await (await requirePuckPublishButton()).click();
      expect((await (await authorized.get(scope)).json()).published).toBeNull();

      // Explicit merchant confirmation publishes the selected site/market/locale.
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("us / en");
        await dialog.accept();
      });
      await (await requirePuckPublishButton()).click();
      await expect(page.locator('p[role="status"]')).toContainText("发布成功", { timeout: 30_000 });

      const published = await authorized.get(scope);
      const after = await published.json() as {
        published:ThemeData | null; publishedRevision: number;
      };
      expect(after.published?.content).toHaveLength(4);
      expect(after.publishedRevision).toBe(1);

      // Next.js revalidation should show the published page, not cached Paper content.
      await page.goto(home, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "THE CI FASHION STORY" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "THE CI PRODUCT EDIT" })).toBeVisible();
      // Product data must be served by Saleor rather than the placeholder cards in the Puck editor.
      const productLinks = page.locator('a[href*="/products/"]');
      await expect.poll(() => productLinks.count(), {timeout:30_000}).toBeGreaterThan(0);

      await page.setViewportSize({ width:390,height:844 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "THE CI FASHION STORY" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "THE CI PRODUCT EDIT" })).toBeVisible();
    } finally {
      await page.close();
      await context.close();
      await authorized.dispose();
    }
  });

  test("default PDP template keeps core buy box locked and only publishes marketing sections",async({browser})=>{
    test.skip(!password||!process.env.PLAYWRIGHT_THEME_DB_RESET_TOKEN,
      "Requires isolated Saleor + theme libSQL integration setup");
    const authorized=await playwrightRequest.newContext({
      baseURL,httpCredentials:{username:"analytics",password:password!},
    });
    const context=await browser.newContext({
      httpCredentials:{username:"analytics",password:password!},
      viewport:{width:390,height:844},
    });
    const page=await context.newPage();
    const endpoint="/ops/themes/pages/api";
    const scope=endpoint+"?channel=us&locale=en&pageType=product&template=default";
    try{
      const initial=await authorized.get(scope);
      expect(initial.status(),await initial.text()).toBe(200);
      const state=await initial.json() as {published:ThemeData|null;draftRevision:number};
      // The isolated CI libSQL database is shared between tests and retries.
      // Assert against the starting revision and published snapshot, not an empty DB.
      const startingRevision=state.draftRevision;
      const heading="CI PDP MATERIALS "+Date.now().toString(36).toUpperCase();
      const content=structuredClone(PRODUCT_DETAIL_TEMPLATE);
      content.content[0]!.props.heading=heading;

      const invalid=await authorized.put(endpoint,{
        headers:{Origin:baseURL},
        data:{channel:"us",locale:"en",pageType:"product",template:"default",
          action:"draft",expectedRevision:0,data:FASHION_TEMPLATE},
      });
      expect(invalid.status()).toBe(400);
      const wrong=await authorized.put(endpoint,{
        headers:{Origin:baseURL},
        data:{channel:"unknown",locale:"en",pageType:"product",template:"default",
          action:"draft",expectedRevision:startingRevision,data:content},
      });
      expect(wrong.status()).toBe(400);

      const catalog=await authorized.get("/ops/themes/catalog?kind=collection-products&channel=us&slug=featured-products");
      const itemData=await catalog.json() as {collection?:{products?:{slug:string}[]}};
      const slug=itemData.collection?.products?.[0]?.slug;
      expect(slug).toBeTruthy();
      const productPath="/en/us/products/"+slug;
      await page.goto(productPath);
      await expect(page.getByRole("heading",{name:heading})).toHaveCount(0);

      const saved=await authorized.put(endpoint,{
        headers:{Origin:baseURL},
        data:{channel:"us",locale:"en",pageType:"product",template:"default",
          action:"draft",expectedRevision:startingRevision,data:content},
      });
      expect(saved.status(),await saved.text()).toBe(200);
      const beforePublishing=await authorized.get(scope);
      const beforeState=await beforePublishing.json() as {published:ThemeData|null;draftRevision:number};
      expect(beforeState.published).toEqual(state.published);
      expect(beforeState.draftRevision).toBe(startingRevision+1);
      await page.reload();
      await expect(page.getByRole("heading",{name:heading})).toHaveCount(0);

      const stale=await authorized.put(endpoint,{
        headers:{Origin:baseURL},
        data:{channel:"us",locale:"en",pageType:"product",template:"default",
          action:"publish",expectedRevision:startingRevision,data:content},
      });
      expect(stale.status()).toBe(409);

      const published=await authorized.put(endpoint,{
        headers:{Origin:baseURL},
        data:{channel:"us",locale:"en",pageType:"product",template:"default",
          action:"publish",expectedRevision:startingRevision+1,data:content},
      });
      expect(published.status(),await published.text()).toBe(200);
      await page.goto(productPath,{waitUntil:"domcontentloaded"});
      await expect(page.getByRole("heading",{name:heading}))
        .toBeVisible({timeout:30_000});
      // Purchase area and main product heading must not disappear after publishing.
      await expect(page.getByRole("heading",{level:1})).toBeVisible();

      await page.goto("/ops/themes?pageType=product");
      await expect(page.getByRole("heading",{name:"品牌网站装修"})).toBeVisible();
      await expect(page.getByLabel("选择装修页面")).toHaveValue("product");
      await expect(page.getByRole("button",{name:"发布上线",exact:true}).first()).toBeVisible({timeout:30_000});

      const foreignOrigin=await authorized.put(endpoint,{
        headers:{Origin:"https://outside.example"},
        data:{channel:"us",locale:"en",pageType:"product",template:"default",
          action:"draft",expectedRevision:startingRevision+2,data:content},
      });
      expect(foreignOrigin.status()).toBe(403);
    }finally{
      await page.close();
      await context.close();
      await authorized.dispose();
    }
  });


  test("saved storefront templates stay scoped and never publish automatically",async({browser})=>{
    test.skip(!password||!process.env.PLAYWRIGHT_THEME_DB_RESET_TOKEN,
      "Requires authenticated Saleor + isolated theme storage");
    const authorized=await playwrightRequest.newContext({
      baseURL,httpCredentials:{username:"analytics",password:password!},
    });
    const context=await browser.newContext({
      httpCredentials:{username:"analytics",password:password!},
      viewport:{width:1366,height:860},
    });
    const page=await context.newPage();
    const library="/ops/themes/templates/api";
    const params="?channel=us&locale=en&pageType=home";
    let createdId:string|undefined;
    try{
      const previous=await authorized.get(library+params);
      expect(previous.status(),await previous.text()).toBe(200);
      const title="Saved Jewelry Collection";
      const created=await authorized.post(library,{
        headers:{Origin:baseURL},
        data:{channel:"us",locale:"en",pageType:"home",title,data:JEWELRY_TEMPLATE},
      });
      expect(created.status(),await created.text()).toBe(201);
      const createdBody=await created.json() as {item:{id:string;title:string}};
      expect(createdBody.item.title).toBe(title);
      createdId=createdBody.item.id;
      const listed=await authorized.get(library+params);
      const listBody=await listed.json() as {items:{id:string;title:string}[]};
      expect(listBody.items.some(item=>item.id===createdBody.item.id)).toBe(true);
      const loaded=await authorized.get(library+params+"&id="+createdBody.item.id);
      const savedBody=await loaded.json() as {data:ThemeData};
      expect(savedBody.data.content[0]?.props.heading).toBe(JEWELRY_TEMPLATE.content[0]?.props.heading);

      const foreignScope=await authorized.get(library+"?channel=not-a-store&locale=en&pageType=home");
      expect(foreignScope.status()).toBe(400);
      const unsafe=await authorized.post(library,{
        headers:{Origin:baseURL},
        data:{channel:"us",locale:"en",pageType:"product",title:"Unsafe Product Template",data:FASHION_TEMPLATE},
      });
      expect(unsafe.status()).toBe(400);
      const foreignOrigin=await authorized.post(library,{
        headers:{Origin:"https://other.example"},
        data:{channel:"us",locale:"en",pageType:"home",title:"Bad",data:FASHION_TEMPLATE},
      });
      expect(foreignOrigin.status()).toBe(403);

      // Operator can see the saved template without injecting changes into a published homepage.
      await page.goto("/ops/themes");
      await expect(page.getByRole("heading",{name:"品牌网站装修"})).toBeVisible();
      await page.getByText("我的模板",{exact:true}).click();
      await expect(page.getByLabel("已保存模板")).toContainText(title);
      const before=await authorized.get("/ops/themes/api?channel=us&locale=en");
      const beforeBody=await before.json() as {published:ThemeData|null};
      await page.getByLabel("已保存模板").selectOption(createdBody.item.id);
      await page.getByRole("button",{name:"应用到草稿"}).click();
      await expect(page.getByRole("status").filter({hasText:"已应用模板至当前草稿"})).toBeVisible();
      const after=await authorized.get("/ops/themes/api?channel=us&locale=en");
      const afterBody=await after.json() as {published:ThemeData|null};
      expect(afterBody.published).toEqual(beforeBody.published);
    }finally{
      if(createdId){
        await authorized.delete(library+params+"&id="+encodeURIComponent(createdId),{
          headers:{Origin:baseURL},
        });
      }
      await page.close();
      await context.close();
      await authorized.dispose();
    }
  });


  test("AI design drawer exposes model switching without publishing or revealing API keys",async({browser})=>{
    test.skip(!password,"Requires authenticated operations browser");
    const context=await browser.newContext({
      httpCredentials:{username:"analytics",password:password!},viewport:{width:1440,height:900},
    });
    const page=await context.newPage();
    try{
      await page.goto("/ops/themes");
      await expect(page.getByRole("heading",{name:"品牌网站装修"})).toBeVisible();
      await page.getByRole("button",{name:"打开 AI 装修助手"}).click();
      const drawer=page.getByRole("complementary",{name:"AI 装修助手"});
      await expect(drawer).toBeVisible();
      await drawer.getByRole("button",{name:"模型设置"}).click();
      await expect(drawer.getByLabel("AI 接口地址")).toBeVisible();
      await expect(drawer.getByLabel("模型名称")).toBeVisible();
      await expect(drawer.getByLabel("API Key")).toHaveAttribute("type","password");
      await expect(drawer.getByLabel("AI 修改范围")).toBeVisible();
      await drawer.getByLabel("AI 修改范围").selectOption("block");
      await expect(drawer.getByLabel("AI 目标模块")).toBeVisible();
      await expect(drawer.getByRole("button",{name:"生成并更新中间预览"})).toBeDisabled();
      await drawer.getByRole("button",{name:"关闭 AI 面板"}).click();
      await expect(drawer).toHaveCount(0);
    }finally{
      await context.close();
    }
  });

});
