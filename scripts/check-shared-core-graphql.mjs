/**
 * Real Saleor GraphQL regression: shared-Core guest mode must reject account
 * bypasses even when requests skip the Paper storefront entirely.
 * Intended for the CI backend after it is restarted with
 * SALEOR_SHARED_CORE_GUEST_ONLY=true.
 */
import assert from "node:assert/strict";

const endpoint = process.env.SALEOR_API_URL ?? "http://127.0.0.1:8000/graphql/";
const customerEmail = "guest-policy-customer@example.test";
const staffEmail = "guest-policy-staff@example.test";
const password = "Guest-Policy-CI-Password-1234!";
const legacyToken = process.env.CI_SHARED_CUSTOMER_TOKEN;
const legacyRefresh = process.env.CI_SHARED_CUSTOMER_REFRESH;
if (!legacyToken || !legacyRefresh) throw new Error("CI customer tokens were not seeded");

async function graphql(query, variables, token) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  assert.equal(response.status, 200, `Unexpected HTTP status: ${response.status}`);
  return response.json();
}

function forbidden(result, label) {
  assert.ok(result.errors?.some((e) => e.extensions?.code ===
    "SHARED_CORE_CUSTOMER_ACCOUNTS_DISABLED"), `${label}: ${JSON.stringify(result)}`);
  assert.equal(result.data?.accountRegister ?? null, null);
}

const catalog = await graphql('{ products(first: 1, channel: "us") { totalCount } }');
assert.equal(catalog.errors, undefined, JSON.stringify(catalog));
assert.ok(catalog.data?.products?.totalCount > 0, JSON.stringify(catalog));

const registered = await graphql(`
  mutation {
    aliasRegister: accountRegister(input: {
      email: "forbidden-registration@example.test",
      password: "Guest-Policy-CI-Password-1234!"
    }) { errors { code } }
  }
`);
forbidden(registered, "alias accountRegister");

const fragment = await graphql(`
  mutation { ...GlobalPasswordReset }
  fragment GlobalPasswordReset on Mutation {
    disguised: requestPasswordReset(
      email: "guest-policy-customer@example.test",
      redirectUrl: "https://fashion.example.test/password"
      channel: "us"
    ) { errors { code } }
  }
`);
forbidden(fragment, "fragment requestPasswordReset");

const oldJwt = await graphql("{ me { email } }", undefined, legacyToken);
forbidden(oldJwt, "legacy customer JWT");
assert.equal(oldJwt.data?.me ?? null, null, JSON.stringify(oldJwt));

const checkoutUnderOldJwt = await graphql(`
  mutation { checkoutCreate(input: {channel: "us", lines: []}) {
    checkout { id } errors { code }
  } }
`, undefined, legacyToken);
forbidden(checkoutUnderOldJwt, "authenticated checkout using global customer JWT");

const customerLogin = await graphql(`
  mutation($email: String!, $password: String!) {
    tokenCreate(email:$email, password:$password) {
      token user { email } errors { code }
    }
  }
`, { email: customerEmail, password });
assert.equal(customerLogin.errors, undefined, JSON.stringify(customerLogin));
assert.equal(customerLogin.data?.tokenCreate?.token, null);
assert.equal(customerLogin.data?.tokenCreate?.user, null);
assert.equal(customerLogin.data?.tokenCreate?.errors?.[0]?.code, "INVALID_CREDENTIALS");

const customerRefresh = await graphql(`
  mutation($refresh: String!) {
    tokenRefresh(refreshToken:$refresh) { token errors { code } }
  }
`, { refresh: legacyRefresh });
assert.equal(customerRefresh.errors, undefined, JSON.stringify(customerRefresh));
assert.equal(customerRefresh.data?.tokenRefresh?.token, null);
assert.equal(customerRefresh.data?.tokenRefresh?.errors?.[0]?.code, "JWT_INVALID_TOKEN");

const staffLogin = await graphql(`
  mutation($email: String!, $password: String!) {
    tokenCreate(email:$email, password:$password) {
      token user { email } errors { code }
    }
  }
`, { email: staffEmail, password });
assert.equal(staffLogin.errors, undefined, JSON.stringify(staffLogin));
assert.ok(staffLogin.data?.tokenCreate?.token, JSON.stringify(staffLogin));
assert.equal(staffLogin.data?.tokenCreate?.user?.email, staffEmail);
assert.deepEqual(staffLogin.data?.tokenCreate?.errors, []);
const staffMe = await graphql("{ me { email } }", undefined, staffLogin.data.tokenCreate.token);
assert.equal(staffMe.data?.me?.email, staffEmail, JSON.stringify(staffMe));

console.log("Shared Saleor Core guest-only GraphQL: guest catalog, direct-account denials, old JWT, refresh, staff login all passed.");
