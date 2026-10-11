import { expect, it } from "vitest";
import contracts from "./storage-contracts.json";
import { listSystemPlugins, type SystemPluginId } from "./registry";
it("keeps declared storage/API contracts in sync with the seven static modules", () => {
  const modules = listSystemPlugins();
  expect(Object.keys(contracts.modules).sort()).toEqual(modules.map(plugin => plugin.id).sort());
  for (const plugin of modules) {
    const contract = contracts.modules[plugin.id as SystemPluginId];
    expect(contract.apiVersion).toBe(plugin.apiVersion); expect(contract.storageContractVersion).toBe(1);
  }
  expect(contracts.contractVersion).toBe(1);
  expect(Object.keys(contracts.modules["seo-merchant"].tables)).toEqual([]);
});
