import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({pipeline:vi.fn(),rows:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/storage/libsql-http",()=>({
  libsqlPipeline:mocks.pipeline,hranaRowsToObjects:mocks.rows,
}));
import {
  aiConfigurationReady,createAiProvider,listAiProviders,
  activeAiProvider,activateAiProvider,deleteAiProvider,
} from "./ai-providers.server";

beforeEach(()=>{
  vi.clearAllMocks();
  process.env.THEME_LIBSQL_URL="libsql://ai-test.local";
  process.env.THEME_LIBSQL_AUTH_TOKEN="ai-test-db-token";
  process.env.STOREFRONT_SITE_ID="sample-site";
  process.env.THEME_AI_ENCRYPTION_KEY="f".repeat(64);
  process.env.THEME_AI_ALLOWED_ENDPOINTS="https://gateway.example.com/v1";
  delete process.env.STOREFRONT_SITES_JSON;
  mocks.pipeline.mockResolvedValue([{cols:[],rows:[],affected_row_count:1}]);
  mocks.rows.mockReturnValue([]);
});
afterEach(()=>{
  delete process.env.THEME_AI_ENCRYPTION_KEY;
  delete process.env.THEME_AI_ALLOWED_ENDPOINTS;
});
describe("theme AI provider encrypted configuration",()=>{
  it("requires a configured encryption key, not NEXT_PUBLIC secrets",()=>{
    expect(aiConfigurationReady()).toBe(true);
    delete process.env.THEME_AI_ENCRYPTION_KEY;
    expect(aiConfigurationReady()).toBe(false);
  });
  it("persists only ciphertext and brand scoping, returns no key fields",async()=>{
    const apiKey="sk-demo-never-return-this";
    const result=await createAiProvider("us",{
      title:"Custom AI",baseUrl:"https://gateway.example.com/v1",
      model:"gpt-compatible",apiKey,
    });
    expect(result.title).toBe("Custom AI");
    expect(JSON.stringify(result)).not.toContain(apiKey);
    const [statements]=mocks.pipeline.mock.lastCall as [Array<{sql:string;args:unknown[]}>];
    const args=statements[0].args;
    expect(statements[0].sql).toContain("storefront_theme_ai_profiles");
    expect(args[0]).toBe("sample-site");
    expect(args[5]).not.toBe(apiKey);
    expect(String(args[5])).not.toContain(apiKey);
    expect(String(args[5]).split(".")).toHaveLength(3);
  });
  it("decrypts only on the server for the active provider and never lists plaintext keys",async()=>{
    const created=await createAiProvider("us",{
      title:"OpenAI",baseUrl:"https://api.openai.com/v1",model:"gpt-4.1",apiKey:"sk-private",
    });
    const [stmt]=mocks.pipeline.mock.lastCall as [Array<{args:unknown[]}>];
    const ciphertext=String(stmt[0].args[5]);
    mocks.rows.mockReturnValueOnce([{
      profile_id:created.id,title:"OpenAI",base_url:"https://api.openai.com/v1",
      model:"gpt-4.1",is_active:1,updated_at:"now",api_key_encrypted:ciphertext,
    }]);
    const active=await activeAiProvider("us");
    expect(active?.apiKey).toBe("sk-private");
    mocks.rows.mockReturnValueOnce([{
      profile_id:created.id,title:"OpenAI",base_url:"https://api.openai.com/v1",
      model:"gpt-4.1",is_active:1,updated_at:"now",
    }]);
    const listed=await listAiProviders("us");
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("sk-private");
    expect(listed[0]).not.toHaveProperty("apiKey");
  });
  it("refuses non-approved gateways before writing any provider",async()=>{
    await expect(createAiProvider("us",{
      title:"Unknown",baseUrl:"https://malicious.example/v1",
      model:"test",apiKey:"secret",
    })).rejects.toThrow("not in THEME_AI_ALLOWED_ENDPOINTS");
  });
  it("rejects activation or deletion of invalid cross-scope IDs",async()=>{
    mocks.rows.mockReturnValue([]);
    await expect(activateAiProvider("us","not-an-id")).rejects.toThrow();
    await expect(deleteAiProvider("us","not-an-id")).rejects.toThrow();
  });
});
