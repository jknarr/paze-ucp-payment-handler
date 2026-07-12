import type {
  PazeCompletion,
  PazeDisplay,
  PazeHandlerConfig,
  PazeSelection,
} from "./contract";
import type { UcpPostalAddress, UcpTotal } from "./ucp-types";

const SDK_URLS = {
  sandbox: "https://checkout.wallet.uat.earlywarning.io/web/resources/js/digitalwallet-sdk.js",
  production: "https://checkout.paze.com/web/resources/js/digitalwallet-sdk.js",
} as const;

export type PazeTransactionValue = {
  transactionCurrencyCode: string;
  transactionAmount: string;
  subtotal?: string;
  taxAmount?: string;
  shippingAmount?: string;
};

export type PazeSdk = {
  initialize(options: {
    client: { id: string; name: string; profileId?: string; url?: string };
  }): Promise<void>;
  canCheckout(input: { emailAddress?: string; mobileNumber?: string }): Promise<{ consumerPresent: boolean }>;
  checkout(options: {
    sessionId: string;
    actionCode: "START_FLOW" | "CHANGE_CARD" | "CHANGE_SHIPPING_ADDRESS";
    intent: "REVIEW_AND_PAY" | "EXPRESS_CHECKOUT" | "ADD_CARD";
    transactionValue: PazeTransactionValue;
    shippingPreference: "ALL" | "NONE";
    billingPreference: "ALL" | "ZIP_COUNTRY" | "NONE";
    emailAddress?: string;
    mobileNumber?: string;
  }): Promise<{ result: "COMPLETE" | "INCOMPLETE"; checkoutResponse?: string }>;
  complete(options: {
    transactionType: "PURCHASE" | "CARD_ON_FILE" | "BOTH";
    sessionId: string;
    transactionValue: PazeTransactionValue;
    transactionOptions: { payloadTypeIndicator: "PAYMENT" | "ID"; billingPreference: "ALL" | "ZIP_COUNTRY" | "NONE" };
    enhancedTransactionData?: {
      ecomData?: {
        cartContainsGiftCard?: boolean;
        orderForPickup?: boolean;
        orderQuantity?: string;
        orderHighestCost?: string;
      };
    };
  }): Promise<PazeCompletion>;
};

declare global {
  interface Window {
    DIGITAL_WALLET_SDK?: PazeSdk;
    DIGITAL_WALLET_SDK_READY?: Promise<unknown>;
  }
}

type DecodedCheckout = {
  consumer?: { fullName?: string; firstName?: string; lastName?: string };
  maskedCard?: { paymentCardBrand?: string; panLastFour?: string };
  shippingAddress?: {
    name?: string;
    line1?: string;
    line2?: string;
    line3?: string;
    city?: string;
    state?: string;
    zip?: string;
    countryCode?: string;
  };
};

export function transactionValueFromTotals(
  totals: UcpTotal[],
  currency = "USD",
): PazeTransactionValue {
  const amount = (type: string) =>
    ((totals.find((entry) => entry.type === type)?.amount ?? 0) / 100).toFixed(2);
  return {
    transactionCurrencyCode: currency,
    transactionAmount: amount("subtotal"),
    subtotal: amount("subtotal"),
    taxAmount: amount("tax"),
    shippingAmount: amount("fulfillment"),
  };
}

export function decodeCheckoutResponse(jws: string): DecodedCheckout {
  try {
    const encoded = jws.split(".")[1];
    if (!encoded) return {};
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as DecodedCheckout;
  } catch {
    return {};
  }
}

export class PazeSdkClient {
  private initialization: Promise<PazeSdk> | null = null;
  private sdk: PazeSdk | null = null;

  constructor(private readonly config: PazeHandlerConfig) {}

  initialize(): Promise<PazeSdk> {
    if (this.initialization) return this.initialization;
    this.initialization = new Promise<PazeSdk>((resolve, reject) => {
      const initializeSdk = async () => {
        const sdk = window.DIGITAL_WALLET_SDK;
        if (!sdk) throw new Error("Paze SDK loaded without DIGITAL_WALLET_SDK");
        if (window.DIGITAL_WALLET_SDK_READY) await window.DIGITAL_WALLET_SDK_READY;
        await sdk.initialize({
          client: {
            id: this.config.client_id,
            name: this.config.client_name ?? "UCP merchant",
            ...(this.config.profile_id ? { profileId: this.config.profile_id } : {}),
            url: window.location.href,
          },
        });
        this.sdk = sdk;
        resolve(sdk);
      };

      if (window.DIGITAL_WALLET_SDK) {
        void initializeSdk().catch(reject);
        return;
      }
      const sdkUrl = SDK_URLS[this.config.environment];
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${sdkUrl}"]`);
      if (existing) {
        existing.addEventListener("load", () => void initializeSdk().catch(reject), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Unable to load Paze SDK from ${sdkUrl}`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = sdkUrl;
      script.async = true;
      script.addEventListener("load", () => void initializeSdk().catch(reject));
      script.addEventListener("error", () => reject(new Error(`Unable to load Paze SDK from ${sdkUrl}`)));
      document.head.appendChild(script);
    }).catch((error) => {
      this.initialization = null;
      throw error;
    });
    return this.initialization;
  }

  async canCheckout(input: { emailAddress?: string; mobileNumber?: string }): Promise<boolean> {
    const sdk = await this.initialize();
    return Boolean((await sdk.canCheckout(input)).consumerPresent);
  }

  checkout(input: Parameters<PazeSdk["checkout"]>[0]) {
    if (!this.sdk) throw new Error("Paze is not initialized");
    return this.sdk.checkout(input);
  }

  complete(input: Parameters<PazeSdk["complete"]>[0]) {
    if (!this.sdk) throw new Error("Paze is not initialized");
    return this.sdk.complete(input);
  }
}

export function displayFromCheckoutResponse(checkoutResponse: string): PazeDisplay {
  const decoded = decodeCheckoutResponse(checkoutResponse);
  const joinedName = [decoded.consumer?.firstName, decoded.consumer?.lastName]
    .filter(Boolean)
    .join(" ");
  const buyerName = decoded.consumer?.fullName ?? (joinedName || undefined);
  const shipping = decoded.shippingAddress;
  const shippingAddress: UcpPostalAddress | undefined = shipping
    ? {
        street_address: shipping.line1,
        extended_address: [shipping.line2, shipping.line3].filter(Boolean).join(", ") || undefined,
        address_locality: shipping.city,
        address_region: shipping.state,
        postal_code: shipping.zip,
        address_country: shipping.countryCode,
        first_name: decoded.consumer?.firstName,
        last_name: decoded.consumer?.lastName,
      }
    : undefined;
  return {
    card_network: decoded.maskedCard?.paymentCardBrand,
    pan_last_four: decoded.maskedCard?.panLastFour,
    buyer_name: buyerName,
    shipping_address: shippingAddress,
  };
}

export async function selectPayment(input: {
  client: PazeSdkClient;
  sessionId: string;
  action: "START_FLOW" | "CHANGE_CARD";
  totals: UcpTotal[];
  currency?: string;
  lookup?: { emailAddress?: string; mobileNumber?: string };
}): Promise<PazeSelection> {
  const result = await input.client.checkout({
    sessionId: input.sessionId,
    actionCode: input.action,
    intent: "REVIEW_AND_PAY",
    transactionValue: transactionValueFromTotals(input.totals, input.currency),
    shippingPreference: "ALL",
    billingPreference: "ALL",
    ...(input.lookup ?? {}),
  });
  if (result.result !== "COMPLETE") {
    const error = new Error(
      `Paze returned ${result.result ?? "no result"}; no payment selection was created`,
    ) as Error & { code?: string };
    error.code = "PAZE_CHECKOUT_INCOMPLETE";
    throw error;
  }
  if (!result.checkoutResponse) {
    const error = new Error(
      "Paze returned COMPLETE without a checkout response",
    ) as Error & { code?: string };
    error.code = "PAZE_CHECKOUT_RESPONSE_MISSING";
    throw error;
  }
  return {
    checkout_response: result.checkoutResponse,
    display: displayFromCheckoutResponse(result.checkoutResponse),
  };
}

export function completePayment(input: {
  client: PazeSdkClient;
  sessionId: string;
  totals: UcpTotal[];
  currency?: string;
}) {
  return input.client.complete({
    transactionType: "PURCHASE",
    sessionId: input.sessionId,
    transactionValue: transactionValueFromTotals(input.totals, input.currency),
    transactionOptions: { payloadTypeIndicator: "PAYMENT", billingPreference: "ALL" },
  });
}
