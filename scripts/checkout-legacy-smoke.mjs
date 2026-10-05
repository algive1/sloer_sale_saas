const endpoint = process.env.SALEOR_API_URL ?? "http://localhost:8000/graphql/";

async function gql(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }
  return payload.data;
}

function assertNoErrors(result, name) {
  const errors = result?.errors ?? [];
  if (errors.length) {
    throw new Error(`${name} errors: ${JSON.stringify(errors)}`);
  }
}

const catalog = await gql(`
  query SmokeCatalog($channel: String!) {
    products(first: 25, channel: $channel) {
      edges {
        node {
          id
          slug
          productVariants(first: 25) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`, { channel: "us" });

const candidate = catalog.products.edges
  .flatMap(({ node: product }) =>
    product.productVariants.edges.map(({ node: variant }) => ({ product, variant })),
  )
  .find(({ variant }) => Boolean(variant.id));

if (!candidate) throw new Error("No US product variant found for checkout smoke test.");

console.log("Using variant", {
  product: candidate.product.slug,
  variant: candidate.variant.id,
  name: candidate.variant.name,
});

const address = {
  firstName: "Checkout",
  lastName: "Smoke",
  streetAddress1: "1 Market St",
  streetAddress2: "",
  city: "San Francisco",
  postalCode: "94105",
  country: "US",
  countryArea: "CA",
  phone: "+14155550123",
};

const created = await gql(`
  mutation SmokeCheckoutCreate($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      errors { field code message }
      checkout {
        id
        email
        channel { slug }
        isShippingRequired
        totalPrice { gross { amount currency } }
        shippingMethods { id name }
        lines { id quantity variant { id } }
      }
    }
  }
`, {
  input: {
    channel: "us",
    email: "checkout-smoke@example.com",
    lines: [{ variantId: candidate.variant.id, quantity: 1 }],
    shippingAddress: address,
    billingAddress: address,
  },
});

assertNoErrors(created.checkoutCreate, "checkoutCreate");
let checkout = created.checkoutCreate.checkout;
if (!checkout?.id) throw new Error("checkoutCreate did not return a checkout.");
if (checkout.channel?.slug !== "us") throw new Error(`Expected channel us, got ${checkout.channel?.slug}`);
if (checkout.totalPrice?.gross?.currency !== "USD") {
  throw new Error(`Expected USD checkout, got ${checkout.totalPrice?.gross?.currency}`);
}

if (checkout.isShippingRequired) {
  let methods = checkout.shippingMethods ?? [];

  if (!methods.length) {
    const recalculated = await gql(`
      mutation CalculateDelivery($id: ID!) {
        deliveryOptionsCalculate(id: $id) {
          errors { field code message }
          deliveries {
            id
            shippingMethod { id name active }
          }
        }
      }
    `, { id: checkout.id });

    assertNoErrors(recalculated.deliveryOptionsCalculate, "deliveryOptionsCalculate");
    methods = (recalculated.deliveryOptionsCalculate.deliveries ?? [])
      .map((delivery) => delivery.shippingMethod)
      .filter(Boolean);
  }

  const method = methods.find((item) => item?.id);
  if (!method) throw new Error("No shipping method available for US checkout.");

  const delivery = await gql(`
    mutation SetDelivery($checkoutId: ID!, $deliveryMethodId: ID!) {
      checkoutDeliveryMethodUpdate(id: $checkoutId, deliveryMethodId: $deliveryMethodId) {
        errors { field code message }
        checkout {
          id
          totalPrice { gross { amount currency } }
          delivery {
            id
            shippingMethod { id name }
          }
        }
      }
    }
  `, { checkoutId: checkout.id, deliveryMethodId: method.id });

  assertNoErrors(delivery.checkoutDeliveryMethodUpdate, "checkoutDeliveryMethodUpdate");
  checkout = { ...checkout, ...delivery.checkoutDeliveryMethodUpdate.checkout };
  console.log("Selected shipping", delivery.checkoutDeliveryMethodUpdate.checkout.delivery?.shippingMethod);
}

const total = checkout.totalPrice?.gross;
if (!total || !(Number(total.amount) > 0) || total.currency !== "USD") {
  throw new Error(`Invalid checkout total: ${JSON.stringify(total)}`);
}

const paid = await gql(`
  mutation LegacyDummyPayment($checkoutId: ID, $input: PaymentInput!) {
    checkoutPaymentCreate(id: $checkoutId, input: $input) {
      errors { field code message }
      checkout { id }
      payment { id chargeStatus }
    }
  }
`, {
  checkoutId: checkout.id,
  input: {
    amount: total.amount,
    gateway: "mirumee.payments.dummy",
    token: "fully_charged",
  },
});

assertNoErrors(paid.checkoutPaymentCreate, "checkoutPaymentCreate");
if (!paid.checkoutPaymentCreate.payment?.id) throw new Error("Dummy payment was not created.");

const completed = await gql(`
  mutation CompleteSmokeCheckout($checkoutId: ID!) {
    checkoutComplete(id: $checkoutId) {
      errors { field code message }
      order {
        id
        number
        channel { slug }
        isPaid
        paymentStatus
        chargeStatus
        total { gross { amount currency } }
        lines { id quantity variant { id } }
      }
    }
  }
`, { checkoutId: checkout.id });

assertNoErrors(completed.checkoutComplete, "checkoutComplete");
const order = completed.checkoutComplete.order;
if (!order?.id) throw new Error("checkoutComplete did not create an order.");
if (order.channel?.slug !== "us") throw new Error(`Expected order channel us, got ${order.channel?.slug}`);
if (order.total?.gross?.currency !== "USD") throw new Error(`Expected order USD, got ${order.total?.gross?.currency}`);
if (!order.isPaid) throw new Error(`Expected paid order, got paymentStatus=${order.paymentStatus}`);

console.log("Checkout smoke passed", {
  checkoutId: checkout.id,
  orderId: order.id,
  orderNumber: order.number,
  paymentStatus: order.paymentStatus,
  chargeStatus: order.chargeStatus,
  total: order.total.gross,
});
