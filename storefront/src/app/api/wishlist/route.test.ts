import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
  list: vi.fn(),
  merge: vi.fn(),
  remove: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/graphql", () => ({
  executeAuthenticatedGraphQL: mocks.graphql,
}));
vi.mock("@/lib/wishlist/wishlist-store", () => ({
  wishlistCloudConfigured: () => true,
  listWishlist: mocks.list,
  mergeWishlistOwners: mocks.merge,
  removeWishlist: mocks.remove,
  upsertWishlist: mocks.upsert,
}));

import { GET, POST, DELETE } from "./route";

const siteConfig = JSON.stringify([
  { id:"fashion", name:"Fashion", domains:["fashion.example.test"], channels:["us"], defaultChannel:"us" },
  { id:"jewelry", name:"Jewelry", domains:["jewelry.example.test"], channels:["jewelry-us"], defaultChannel:"jewelry-us" },
]);
const favorite = { productId:"gid://saleor/Product/1", name:"Fashion dress",
  href:"/en/us/products/dress", channel:"us", price:59, currency:"USD" };
const guestId = "c8e8f436-8eb3-4a8e-8e68-a3d3f0a4c7dc";

function request(method: "GET" | "POST" | "DELETE", host: string, data?: unknown) {
  return new NextRequest("https://"+host+"/api/wishlist",{
    method,
    headers: { host, Cookie:`paper_wishlist_owner=${guestId}`, ...(data !== undefined ? { "Content-Type":"application/json" } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.graphql.mockResolvedValue({ok:true,data:{me:{id:"global-customer"}}});
  mocks.list.mockResolvedValue([]);
  mocks.merge.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue(undefined);
});
afterEach(() => { delete process.env.STOREFRONT_SITES_JSON; });

describe("wishlist customer identity boundary", () => {
  it("never reads or merges shared Saleor customer identity across brand hosts", async () => {
    process.env.STOREFRONT_SITES_JSON = siteConfig;
    const fashion = await GET(request("GET", "fashion.example.test"));
    const jewelry = await GET(request("GET", "jewelry.example.test"));
    expect(fashion.status).toBe(200);
    expect(jewelry.status).toBe(200);
    expect(mocks.list).toHaveBeenNthCalledWith(1,`site:fashion:guest:${guestId}`);
    expect(mocks.list).toHaveBeenNthCalledWith(2,`site:jewelry:guest:${guestId}`);
    expect(mocks.graphql).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(fashion.headers.get("set-cookie")).toContain("paper_wishlist_owner=");
  });

  it("retains guest favorites create/delete on own brand, rejecting foreign product channels", async () => {
    process.env.STOREFRONT_SITES_JSON = siteConfig;
    expect((await POST(request("POST","fashion.example.test",favorite))).status).toBe(204);
    expect(mocks.upsert).toHaveBeenCalledWith(`site:fashion:guest:${guestId}`,favorite);
    expect((await POST(request("POST","jewelry.example.test",favorite))).status).toBe(400);
    expect((await DELETE(request("DELETE","fashion.example.test",{productId:favorite.productId}))).status).toBe(204);
    expect(mocks.remove).toHaveBeenCalledWith(`site:fashion:guest:${guestId}`,favorite.productId);
    expect(mocks.graphql).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it("preserves original Saleor signed-in wishlist sync on a single brand", async () => {
    const result=await GET(request("GET","localhost"));
    expect(result.status).toBe(200);
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledWith("user:global-customer");
    expect(mocks.merge).toHaveBeenCalledWith(`guest:${guestId}`,"user:global-customer");
  });

  it("never treats unknown hosts as a guest namespace", async () => {
    process.env.STOREFRONT_SITES_JSON=siteConfig;
    expect((await GET(request("GET","unknown.example.test"))).status).toBe(404);
    expect(mocks.graphql).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
