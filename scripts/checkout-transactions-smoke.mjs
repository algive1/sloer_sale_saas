const endpoint = process.env.SALEOR_API_URL ?? "http://localhost:8000/graphql/";
const gatewayId = "saleor.io.dummy-payment-app";

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
  query TransactionsSmokeCatalog($channel: String!) {
    products(first: 25, channel: $channel) {
      edges {
        node {
          slug
          productVariants(first: 25) {
            edges {
              node { id name }
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

if (!candidate) {
  throw new Error("No US product variant found for Transactions API smoke test.");
}

const address = {
  firstName: "Transactions",
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
  mutation TransactionsCheckoutCreate($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      errors { field code message }
      checkout {
        id
        channel { slug }
        isShippingRequired
        totalPrice { gross { amount currency } }
        shippingMethods { id name }
      }
    }
  }
`, {
  input: {
    channel: "us",
    email: "transactions-smoke@example.com",
    lines: [{ variantId: candidate.variant.id, quantity: 1 }],
    shippingAddress: address,
    billingAddress: address,
  },
});

assertNoErrors(created.checkoutCreate, "checkoutCreate");
let checkout = created.checkoutCreate.checkout;
if (!checkout?.id) throw new Error("checkoutCreate did not return a checkout.");
if (checkout.channel?.slug !== "us") {
  throw new Error(`Expected channel us, got ${checkout.channel?.slug}`);
}

if (checkout.isShippingRequired) {
  let methods = checkout.shippingMethods ?? [];

  if (!methods.length) {
    const recalculated = await gql(`
      mutation TransactionsDeliveryOptions($id: ID!) {
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
    mutation TransactionsSetDelivery($checkoutId: ID!, $deliveryMethodId: ID!) {
      checkoutDeliveryMethodUpdate(id: $checkoutId, deliveryMethodId: $deliveryMethodId) {
        errors { field code message }
        checkout {
          id
          totalPrice { gross { amount currency } }
          delivery { id shippingMethod { id name } }
        }
      }
    }
  `, { checkoutId: checkout.id, deliveryMethodId: method.id });

  assertNoErrors(delivery.checkoutDeliveryMethodUpdate, "checkoutDeliveryMethodUpdate");
  checkout = { ...checkout, ...delivery.checkoutDeliveryMethodUpdate.checkout };
  console.log("Selected shipping", delivery.checkoutDeliveryMethodUpdate.checkout.delivery?.shippingMethod);
}

const paymentState = await gql(`
  query TransactionsPaymentState($id: ID!) {
    checkout(id: $id) {
      id
      totalPrice { gross { amount currency } }
      availablePaymentGateways { id name }
    }
  }
`, { id: checkout.id });

checkout = { ...checkout, ...paymentState.checkout };
const total = checkout.totalPrice?.gross;
if (!total || !(Number(total.amount) > 0) || total.currency !== "USD") {
  throw new Error(`Invalid checkout total: ${JSON.stringify(total)}`);
}

const gateway = checkout.availablePaymentGateways?.find((item) => item.id === gatewayId);
if (!gateway) {
  throw new Error(
    `Official Dummy Payment App gateway not available. Got: ${JSON.stringify(checkout.availablePaymentGateways)}`,
  );
}
console.log("Using payment gateway", gateway);

const initialized = await gql(`
  mutation TransactionsInitialize(
    $checkoutId: ID!
    $paymentGateway: PaymentGatewayToInitialize!
    $amount: PositiveDecimal
  ) {
    transactionInitialize(
      id: $checkoutId
      paymentGateway: $paymentGateway
      amount: $amount
    ) {
      transaction {
        id
        actions
      }
      transactionEvent {
        message
        type
        pspReference
        amount { amount currency }
      }
      data
      errors { field code message }
    }
  }
`, {
  checkoutId: checkout.id,
  amount: total.amount,
  paymentGateway: {
    id: gatewayId,
    data: {
      event: {
        type: "CHARGE_SUCCESS",
        includePspReference: true,
      },
    },
  },
});

assertNoErrors(initialized.transactionInitialize, "transactionInitialize");
const transaction = initialized.transactionInitialize.transaction;
const event = initialized.transactionInitialize.transactionEvent;
if (!transaction?.id) throw new Error("transactionInitialize did not create a transaction.");
if (event?.type !== "CHARGE_SUCCESS") {
  throw new Error(`Expected CHARGE_SUCCESS, got ${JSON.stringify(event)}`);
}
if (!event?.pspReference) {
  throw new Error("Dummy Payment App did not return a PSP reference.");
}

const completed = await gql(`
  mutation TransactionsCompleteCheckout($checkoutId: ID!) {
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
      }
    }
  }
`, { checkoutId: checkout.id });

assertNoErrors(completed.checkoutComplete, "checkoutComplete");
const order = completed.checkoutComplete.order;
if (!order?.id) throw new Error("checkoutComplete did not create an order.");
if (order.channel?.slug !== "us") {
  throw new Error(`Expected order channel us, got ${order.channel?.slug}`);
}
if (order.total?.gross?.currency !== "USD") {
  throw new Error(`Expected order currency USD, got ${order.total?.gross?.currency}`);
}
if (!order.isPaid) {
  throw new Error(
    `Expected paid order, got paymentStatus=${order.paymentStatus}, chargeStatus=${order.chargeStatus}`,
  );
}

console.log("Transactions API smoke passed", {
  checkoutId: checkout.id,
  gatewayId,
  transactionId: transaction.id,
  transactionEvent: event.type,
  pspReference: event.pspReference,
  orderId: order.id,
  orderNumber: order.number,
  paymentStatus: order.paymentStatus,
  chargeStatus: order.chargeStatus,
  total: order.total.gross,
});
