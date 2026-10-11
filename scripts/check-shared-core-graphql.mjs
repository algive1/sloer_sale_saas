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
const checkoutGatewaySecret = process.env.SALEOR_SHARED_CORE_CHECKOUT_GATEWAY_SECRET;
if (!checkoutGatewaySecret || checkoutGatewaySecret.length < 32) throw new Error("Checkout gateway CI secret missing");
const legacyToken = process.env.CI_SHARED_CUSTOMER_TOKEN;
const legacyRefresh = process.env.CI_SHARED_CUSTOMER_REFRESH;
if (!legacyToken || !legacyRefresh) throw new Error("CI customer tokens were not seeded");

async function graphql(query, variables, token, gatewayKey) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(gatewayKey ? { "x-paper-checkout-gateway-secret": gatewayKey } : {}),
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

// The checkout ID by itself is no longer sufficient on the public API.
const checkoutMutation = `mutation($variantId: ID!) {
  checkoutCreate(input: { channel: "us", email: "shared-checkout-test@example.test",
    lines: [{ variantId: $variantId, quantity: 1 }] }) {
    checkout { id channel { slug } } errors { code message }
  }
}`;
const productVariant = await graphql(`query {
  products(first: 1, channel: "us") { edges { node { variants { id } } } }
}`);
const variantId = productVariant.data?.products?.edges?.[0]?.node?.variants?.[0]?.id;
assert.ok(variantId, JSON.stringify(productVariant));
function forbiddenCheckout(result, label) {
  assert.ok(result.errors?.some((e) => e.extensions?.code ===
    "SHARED_CORE_CHECKOUT_GATEWAY_REQUIRED"), `${label}: ${JSON.stringify(result)}`);
}
forbiddenCheckout(await graphql(checkoutMutation, { variantId }), "direct public checkout creation");
forbiddenCheckout(await graphql(checkoutMutation, { variantId }, undefined, "wrong-gateway-key"), "wrong gateway key");
const trustedCheckout = await graphql(checkoutMutation, { variantId }, undefined, checkoutGatewaySecret);
const checkoutId = trustedCheckout.data?.checkoutCreate?.checkout?.id;
assert.ok(checkoutId, JSON.stringify(trustedCheckout));
assert.equal(trustedCheckout.data.checkoutCreate.checkout.channel.slug, "us");
const checkoutRead = `query($id: ID!) { checkout(id: $id) { id channel { slug } email } }`;
forbiddenCheckout(await graphql(checkoutRead, { id: checkoutId }), "direct checkout read by bearer ID");
const trustedRead = await graphql(checkoutRead, { id: checkoutId }, undefined, checkoutGatewaySecret);
assert.equal(trustedRead.data?.checkout?.id, checkoutId, JSON.stringify(trustedRead));
const checkoutUpdate = `mutation($id: ID!) {
  checkoutEmailUpdate(id: $id, email: "changed@example.test") {
    checkout { id email } errors { code message }
  }
}`;
forbiddenCheckout(await graphql(checkoutUpdate, { id: checkoutId }), "direct checkout email update");
const aliasedCheckout = `query($id: ID!) {
  hidden: node(id: $id) { ... on Checkout { email } }
}`;
// Some Saleor versions do not expose Query.node; GraphQL then rejects this
// attempt at schema validation (HTTP 400). If the field exists, the Checkout
// object middleware must reject its sensitive fields. Neither case may leak.
const nodeAttempt = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: aliasedCheckout, variables: { id: checkoutId } }),
});
const nodeBody = await nodeAttempt.json();
if (nodeAttempt.status === 200) {
  forbiddenCheckout(nodeBody, "node fragment checkout email bypass");
} else {
  assert.equal(nodeAttempt.status, 400, JSON.stringify(nodeBody));
  assert.ok(Array.isArray(nodeBody.errors) && nodeBody.errors.length > 0,
    JSON.stringify(nodeBody));
  assert.equal(nodeBody.data?.hidden ?? null, null, JSON.stringify(nodeBody));
}

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

const verifyMutation = `
  mutation($token: String!) {
    tokenVerify(token: $token) {
      isValid user { email } errors { code }
    }
  }
`;
const verifyOldCustomer = await graphql(verifyMutation, { token: legacyToken });
assert.equal(verifyOldCustomer.errors, undefined, JSON.stringify(verifyOldCustomer));
assert.equal(verifyOldCustomer.data?.tokenVerify?.isValid, false);
assert.equal(verifyOldCustomer.data?.tokenVerify?.user, null);
assert.equal(verifyOldCustomer.data?.tokenVerify?.errors?.[0]?.code, "JWT_INVALID_TOKEN");

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
const verifiedStaff = await graphql(verifyMutation, { token: staffLogin.data.tokenCreate.token });
assert.equal(verifiedStaff.errors, undefined, JSON.stringify(verifiedStaff));
assert.equal(verifiedStaff.data?.tokenVerify?.isValid, true);
assert.equal(verifiedStaff.data?.tokenVerify?.user?.email, staffEmail);
assert.deepEqual(verifiedStaff.data?.tokenVerify?.errors, []);
const staffMe = await graphql("{ me { email } }", undefined, staffLogin.data.tokenCreate.token);
assert.equal(staffMe.data?.me?.email, staffEmail, JSON.stringify(staffMe));

console.log("Shared Saleor Core GraphQL: direct anonymous checkout read/write denied, trusted BFF checkout allowed, customer JWT/account denials and staff login/verification passed.");
