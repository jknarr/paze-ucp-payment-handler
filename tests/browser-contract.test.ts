import { strict as assert } from "node:assert";
import { createPazeInstrument, isPazeInstrument } from "../src/contract";
import {
  displayFromCheckoutResponse,
  type PazeSdkClient,
  selectPayment,
} from "../src/sdk";

const checkoutPayload = Buffer.from(JSON.stringify({
  consumer: { firstName: "Demo", lastName: "Buyer" },
  maskedCard: { paymentCardBrand: "VISA", panLastFour: "4242" },
  shippingAddress: {
    line1: "123 Main St",
    line2: "Apt 4",
    city: "Phoenix",
    state: "AZ",
    zip: "85001",
    countryCode: "US",
  },
})).toString("base64url");
const display = displayFromCheckoutResponse(`header.${checkoutPayload}.signature`);
assert.equal(display.shipping_address?.street_address, "123 Main St");
assert.equal(display.shipping_address?.address_locality, "Phoenix");
assert.equal(display.shipping_address?.postal_code, "85001");

const checkoutCalls: Array<Record<string, unknown>> = [];
const mockClient = {
  checkout: async (input: Record<string, unknown>) => {
    checkoutCalls.push(input);
    return {
      result: "COMPLETE" as const,
      checkoutResponse: `header.${checkoutPayload}.signature`,
    };
  },
} as unknown as PazeSdkClient;
await selectPayment({
  client: mockClient,
  sessionId: "checkout-test",
  action: "START_FLOW",
  totals: [{ type: "subtotal", amount: 1000 }],
});
assert.equal("emailAddress" in checkoutCalls[0], false);
assert.equal("mobileNumber" in checkoutCalls[0], false);

const missingResultClient = {
  checkout: async () => undefined,
} as unknown as PazeSdkClient;
await assert.rejects(
  selectPayment({
    client: missingResultClient,
    sessionId: "checkout-without-sdk-result",
    action: "START_FLOW",
    totals: [{ type: "subtotal", amount: 1000 }],
  }),
  (error: Error & { code?: string }) =>
    error.code === "PAZE_CHECKOUT_RESULT_MISSING" &&
    error.message === "Paze did not return a checkout result",
);

const instrument = createPazeInstrument({
  sessionId: "checkout-test",
  handlerId: "merchant-handler",
  selection: { checkout_response: "header.payload.signature", display: { pan_last_four: "2812" } },
  completion: {
    payloadId: "test",
    sessionId: "checkout-test",
    securedPayload: "opaque-merchant-payload",
  },
});
assert.equal(
  isPazeInstrument(instrument, { sessionId: "checkout-test", handlerId: "merchant-handler" }),
  true,
);
assert.ok(Date.parse(instrument.credential.expiry) > Date.now());
console.log("Paze browser handler contract test passed");
