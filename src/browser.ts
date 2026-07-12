import {
  createPazeInstrument,
  PAZE_HANDLER_NAME,
  type PazeHandlerConfig,
} from "./contract";
import { completePayment, PazeSdkClient, selectPayment } from "./sdk";
import type { PazeDisplay } from "./contract";
import type { PazeCheckoutContext } from "./ucp-types";

export type PazeBrowserSelection = {
  opaque: unknown;
  display: PazeDisplay;
};

export type PazeBrowserHandler = {
  name: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  canSelect?(input: Record<string, string>): Promise<boolean>;
  select(input: {
    checkout: PazeCheckoutContext;
    action: "START_FLOW" | "CHANGE_PAYMENT_METHOD";
    consumer?: Record<string, string>;
  }): Promise<PazeBrowserSelection>;
  complete(input: {
    checkout: PazeCheckoutContext;
    selection: PazeBrowserSelection;
  }): Promise<{ instrument: Record<string, unknown> }>;
};

let client: PazeSdkClient | null = null;
let handlerConfig: PazeHandlerConfig | null = null;

function lookupFromConsumer(
  consumer?: Record<string, string>,
): { emailAddress?: string; mobileNumber?: string } | undefined {
  const emailAddress = consumer?.email_address?.trim();
  const mobileNumber = consumer?.mobile_number?.trim();
  if (!emailAddress && !mobileNumber) return undefined;
  return {
    ...(emailAddress ? { emailAddress } : {}),
    ...(mobileNumber ? { mobileNumber } : {}),
  };
}

const handler: PazeBrowserHandler = {
  name: PAZE_HANDLER_NAME,
  async initialize(config) {
    handlerConfig = config as PazeHandlerConfig;
    client = new PazeSdkClient(handlerConfig);
    await client.initialize();
  },
  async canSelect(input) {
    if (!client) throw new Error("Payment handler is not initialized");
    return client.canCheckout(lookupFromConsumer(input) ?? {});
  },
  async select({ checkout, action, consumer }) {
    if (!client || !handlerConfig?.handler_instance_id) {
      throw new Error("Payment handler is not initialized with a handler instance");
    }
    const selection = await selectPayment({
      client,
      sessionId: checkout.id,
      action: action === "CHANGE_PAYMENT_METHOD" ? "CHANGE_CARD" : "START_FLOW",
      totals: checkout.totals,
      currency: checkout.currency,
      lookup: lookupFromConsumer(consumer),
    });
    return { opaque: selection.checkout_response, display: selection.display };
  },
  async complete({ checkout, selection }) {
    if (!client || !handlerConfig?.handler_instance_id) {
      throw new Error("Payment handler is not initialized with a handler instance");
    }
    const handlerId = handlerConfig.handler_instance_id;
    const completion = await completePayment({
      client,
      sessionId: checkout.id,
      totals: checkout.totals,
      currency: checkout.currency,
    });
    if (typeof selection.opaque !== "string") {
      throw new Error("Payment selection is invalid");
    }
    return {
      instrument: createPazeInstrument({
        sessionId: checkout.id,
        handlerId,
        selection: {
          checkout_response: selection.opaque,
          display: selection.display,
        },
        completion,
        payloadId: completion.payloadId,
      }),
    };
  },
};

export default handler;
