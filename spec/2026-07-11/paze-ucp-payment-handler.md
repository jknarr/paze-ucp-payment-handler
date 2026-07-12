# Paze Checkout Payment Handler

- Handler Name: `dev.jknarr.paze_checkout`
- Version: `2026-07-11`
- UCP Core Version: `2026-04-08`
- Status: Experimental proposal; not an official Paze or EWS specification

`com.paze.checkout` is reserved in this proposal for a future specification
published and owned by Paze/Early Warning Services (EWS).

## Introduction

This handler enables a UCP platform to acquire a consumer-present Paze wallet
instrument with the Paze JavaScript SDK and submit it through the standard UCP
checkout completion operation. The platform treats wallet credentials as
opaque. The business remains the Merchant of Record and processes the encrypted
credential internally; no Paze-specific business endpoint is required.

### Key Benefits

- Keeps signed and encrypted Paze material out of model context and URLs.
- Cryptographically binds the credential to both the UCP checkout and the
  onboarded Paze business.
- Lets independently deployed platforms load a versioned browser handler while
  using only standard UCP business endpoints.

### Integration Guide

| Participant | Integration section |
|---|---|
| Business | [Business Integration](#business-integration) |
| Platform | [Platform Integration](#platform-integration) |
| Paze/EWS | [Paze/EWS Integration](#pazeews-integration) |

## Participants

> Terminology: UCP uses “business.” Paze materials may use “merchant.” In this
> handler they identify the same Merchant-of-Record participant.

| Participant | Role | Prerequisites |
|---|---|---|
| Buyer | Selects a wallet instrument and explicitly confirms purchase | An eligible Paze wallet |
| Business | Advertises public Paze configuration, prices the checkout, verifies/decrypts the instrument, and authorizes payment | Paze onboarding, public client/profile identifiers, and a private decryption key |
| Platform | Discovers and negotiates the handler, invokes the browser module, and submits the instrument | Support for this handler version and an allowlisted module origin |
| Paze/EWS | Hosts wallet services, signs responses, and encrypts payment material to the business | Operated by Paze/EWS |
| Handler module host | Publishes the immutable browser ES module and schemas | Controlled release process; intended to be Paze/EWS-owned long term |

## Business Integration

### Prerequisites

Before advertising this handler, a business MUST:

1. Complete Paze onboarding for the applicable environment.
2. Obtain its public `client_id` and optional `profile_id`.
3. Register the public encryption key corresponding to the private key retained
   by the business.
4. Configure the accepted currencies, intents, networks, and module allowlist.

Prerequisites output:

| Field | Description |
|---|---|
| `identity.access_token` | Maps to the business's public Paze `client_id`; it is an identity value in this handler, not an OAuth bearer secret |
| `profile_id` | Optional Paze configuration profile |
| `private_decryption_key` | Business-only secret used during processing; MUST NOT appear in UCP config |
| `environment` | `sandbox` or `production` |

### Handler Configuration

Businesses advertise this handler in `ucp.payment_handlers`.

#### Handler Schema

Schema URL:
`https://raw.githubusercontent.com/jknarr/paze-ucp-payment-handler/v2026-07-11/schemas/2026-07-11/handler.schema.json`

The schema defines:

| Variant | Context | Purpose |
|---|---|---|
| `business_schema` / `business_config` | Business discovery | Public Paze business identity and supported checkout options |
| `platform_schema` / `platform_config` | Platform discovery | Environment and trusted browser-module URL |
| `response_schema` / `response_config` | Checkout responses | Authoritative runtime business configuration |

The Paze instrument extends the UCP
`payment_instrument.json` base schema. Its credential extends
`payment_credential.json`, and its shipping address references the UCP
`postal_address.json` type.

This handler accepts one credential type:

| Credential type | Description |
|---|---|
| `paze_encrypted_payload` | Paze checkout evidence plus completion material encrypted to the business, with a platform-visible RFC 3339 `expiry` |

#### Business Config Fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `environment` | string | Yes | `sandbox` or `production` |
| `client_id` | string | Yes | Public Paze business identity |
| `profile_id` | string | No | Paze configuration profile |
| `client_name` | string | No | Buyer-facing business name |
| `module_url` | URI | No | Business-selected module for its own surfaces; platforms may replace it with an allowlisted module |
| `supported_currencies` | string[] | No | ISO 4217 currencies |
| `supported_intents` | string[] | No | Supported Paze checkout intents |
| `accepted_card_networks` | string[] | No | Accepted Paze card networks |

#### Response Config Fields

The response config carries the resolved `environment`, `client_id`, optional
profile/name/module values, currencies, and intents. The checkout response's
`available_instruments` is authoritative.

#### Example Handler Declaration

```json
{
  "ucp": {
    "version": "2026-04-08",
    "payment_handlers": {
      "dev.jknarr.paze_checkout": [
        {
          "id": "jimporium_paze_sdk",
          "version": "2026-07-11",
          "spec": "https://raw.githubusercontent.com/jknarr/paze-ucp-payment-handler/v2026-07-11/spec/2026-07-11/paze-ucp-payment-handler.md",
          "schema": "https://raw.githubusercontent.com/jknarr/paze-ucp-payment-handler/v2026-07-11/schemas/2026-07-11/handler.schema.json",
          "available_instruments": [{"type": "paze"}],
          "config": {
            "environment": "sandbox",
            "client_id": "PAZE_PUBLIC_SDK_CLIENT_ID",
            "profile_id": "PAZE_PROFILE_ID",
            "supported_currencies": ["USD"],
            "supported_intents": ["REVIEW_AND_PAY"]
          }
        }
      ]
    }
  }
}
```

### Processing Payments

On `POST /checkout-sessions/{checkout_id}/complete`, the business MUST:

1. Validate that `instrument.handler_id` identifies its advertised handler and
   that the instrument conforms to the versioned schema.
2. Return the prior result without processing again when the checkout is already
   completed or the idempotency key was previously consumed.
3. Reject the credential when its platform-visible `expiry` has passed.
4. Verify Paze signatures against the allowlisted Paze JWKS and allowed
   algorithms.
5. Verify checkout binding: the instrument `session_id` and the `sessionId`
   inside Paze's signed `completeResponse` MUST both equal the UCP checkout ID.
6. Decrypt the secure payload with the business private key.
7. Verify business binding: decrypted `clientId` MUST equal the configured
   business `client_id`. Encryption to the business key provides an additional
   business-specific binding.
8. Enforce Paze's authoritative token/cryptogram expiration and single-use
   requirements, then authorize the authoritative server-priced amount.
9. Store only the minimum required payment result and return the finalized UCP
   checkout/order state.

The outer credential `expiry` is an acquisition freshness hint visible to the
platform. Paze's signed/encrypted expiration and downstream authorization remain
authoritative; extending the outer value cannot extend the underlying Paze
credential.

### Error Mapping

| Failure | UCP code | Retry guidance |
|---|---|---|
| Wallet returns `INCOMPLETE` or buyer cancels | `payment_failed` | Buyer may invoke the handler again |
| Credential `expiry` has passed | `payment_failed` | Platform MUST reacquire an instrument |
| Handler/session/business binding mismatch | `payment_failed` | Reject; do not retry the same instrument |
| Signature verification or decryption failure | `payment_failed` | Reject; reacquire before retry |
| Paze or network temporarily unavailable | `payment_failed` | Retry acquisition with backoff |
| Issuer decline or insufficient funds | `payment_failed` | Buyer may choose another wallet instrument |
| Unsupported/missing handler instrument | `payment_failed` | Platform must correct the checkout request |

Implementations MAY add handler-specific diagnostic details, but MUST NOT expose
credentials, tokens, cryptograms, or sensitive provider responses.

## Platform Integration

### Prerequisites

The platform does not require Paze merchant credentials. It MUST:

1. Support the browser module contract for this handler version.
2. Configure an immutable, allowlisted module URL.
3. Keep opaque selection and credential material outside LLM state, logs, and
   URLs.

Prerequisites output:

| Field | Description |
|---|---|
| `identity.access_token` | Not required by Paze for this merchant-configured SDK flow |
| `module_url` | Platform-approved ES module URL |
| `environment` | Supported Paze environment |

### Handler Configuration

#### Platform Config Fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `environment` | string | Yes | Supported Paze environment |
| `module_url` | URI | Yes | Immutable, allowlisted handler module |

#### Example Platform Handler Declaration

```json
{
  "ucp": {
    "version": "2026-04-08",
    "payment_handlers": {
      "dev.jknarr.paze_checkout": [
        {
          "id": "agent_paze_sdk",
          "version": "2026-07-11",
          "spec": "https://raw.githubusercontent.com/jknarr/paze-ucp-payment-handler/v2026-07-11/spec/2026-07-11/paze-ucp-payment-handler.md",
          "schema": "https://raw.githubusercontent.com/jknarr/paze-ucp-payment-handler/v2026-07-11/schemas/2026-07-11/handler.schema.json",
          "available_instruments": [{"type": "paze"}],
          "config": {
            "environment": "sandbox",
            "module_url": "https://payments.paze.example/2026-07-11/paze-handler.js"
          }
        }
      ]
    }
  }
}
```

### Payment Protocol

#### Step 1: Discover and Negotiate

The platform discovers `dev.jknarr.paze_checkout` in the business profile,
intersects handler version and available instruments with its own declaration,
and treats the checkout response as authoritative.

#### Step 2: Initialize

The platform loads the allowlisted `module_url` and calls `initialize()` with
the resolved public business config plus the business handler instance ID.

#### Step 3: Acquire Selection

After presenting the payment action to the buyer, the platform calls `select()`.
Platforms SHOULD call it from a trusted buyer activation when required by the
browser. A conversational platform MAY defer until its agent response is
rendered when the SDK/browser permits; if that automatic launch is blocked, it
MUST present a buyer-activated fallback control. The module maps `START_FLOW` or
`CHANGE_PAYMENT_METHOD` to the Paze SDK, using the UCP checkout ID as Paze
`sessionId`. It returns opaque selection data plus masked display fields.

#### Step 4: Confirm and Construct Instrument

After explicit buyer confirmation, the platform calls `complete()`. The module
calls the Paze SDK with the same session and authoritative transaction values,
then constructs a `paze` instrument. The credential includes a five-minute
platform-visible `expiry`.

#### Step 5: Complete Checkout

```http
POST /checkout-sessions/chk_123/complete
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "payment": {
    "instruments": [
      {
        "id": "paze_chk_123",
        "handler_id": "jimporium_paze_sdk",
        "type": "paze",
        "session_id": "chk_123",
        "selected": true,
        "credential": {
          "type": "paze_encrypted_payload",
          "checkout_response": "<opaque Paze JWS>",
          "complete_response": {"completeResponse": "<opaque Paze result>"},
          "expiry": "2026-07-11T20:05:00.000Z"
        }
      }
    ]
  }
}
```

No Paze-specific business endpoint participates in this flow.

### Browser Module Contract

The module runtime API is handler-specific and is not a UCP protocol endpoint:

```ts
type PazeBrowserHandler = {
  name: "dev.jknarr.paze_checkout";
  initialize(config: ResponseConfig & {
    module_url: string;
    handler_instance_id: string;
  }): Promise<void>;
  canSelect?(input: {
    email_address?: string;
    mobile_number?: string;
  }): Promise<boolean>;
  select(input: {
    checkout: CheckoutInput;
    action: "START_FLOW" | "CHANGE_PAYMENT_METHOD";
    consumer?: {
      email_address?: string;
      mobile_number?: string;
    };
  }): Promise<{opaque: unknown; display: PazeDisplay}>;
  complete(input: {
    checkout: CheckoutInput;
    selection: {opaque: unknown; display: PazeDisplay};
  }): Promise<{instrument: PazeInstrument}>;
};
```

`select()` MUST call Paze checkout before its first asynchronous yield to
preserve browser user activation. The platform MUST treat `opaque` as sensitive
and MUST NOT put it in model context.

### Totals Mapping

| UCP value | Paze SDK value |
|---|---|
| Currency | `transactionCurrencyCode` |
| Merchandise subtotal minus discounts | `transactionAmount` |
| Merchandise subtotal | `subtotal` |
| Tax total | `taxAmount` |
| Fulfillment/shipping total | `shippingAmount` |

`transactionAmount` is not the grand total.

## Paze/EWS Integration

### Prerequisites

Paze/EWS operates the wallet, signing keys, JWKS, SDK distribution, merchant
onboarding, and encryption-key registration. An authoritative release should be
reviewed, versioned, hosted, and assigned a `com.paze.*` name by Paze/EWS.

### Provider Responsibilities

- Sign checkout/completion material and publish rotating verification keys.
- Encrypt payment material only to the onboarded business key.
- Include checkout, business identity, and expiration data in protected content.
- Define production authorization, replay, and cryptogram-consumption rules.

## Security Considerations

| Requirement | Description |
|---|---|
| Checkout binding | Signed `completeResponse.sessionId` and outer `session_id` must equal the UCP checkout ID |
| Business binding | Decrypted `clientId` must equal configured `client_id`; payload is encrypted to that business |
| Expiration | Platform observes outer `expiry`; business enforces it and Paze's authoritative protected expiration |
| Credential opacity | JWS, JWE, tokens, and cryptograms never enter model context, URLs, or buyer-visible diagnostics |
| Key isolation | Business private key remains in the business runtime and never reaches the platform or handler host |
| Pricing integrity | Business recomputes and authorizes server-side totals |
| Idempotency | Completion and credential consumption are single-use and retry-safe |
| Module trust | Platforms load only immutable, allowlisted HTTPS module URLs |
| Algorithm policy | Business allowlists Paze signature, key-management, and content-encryption algorithms |
| Evidence | Demo evidence is redacted and access-controlled; raw payloads are never returned |

## References

- [UCP 2026-04-08 Payment Handler Guide](https://ucp.dev/2026-04-08/specification/payment-handler-guide/)
- [UCP 2026-04-08 Payment Handler Template](https://ucp.dev/2026-04-08/specification/payment-handler-template/)
- [UCP 2026-04-08 Checkout](https://ucp.dev/2026-04-08/specification/checkout/)
- [UCP 2026-04-08 REST Binding](https://ucp.dev/2026-04-08/specification/checkout-rest/)
- Paze developer documentation (access subject to Paze/EWS terms and onboarding)
