# UCP + Paze Demo Integration Plan

Date: 2026-07-11
Status: runnable local vertical slice; deployment hardening remains

Handler release: `2026-07-11` (independent of UCP core `2026-04-08`)

## Goal

Demonstrate a production-shaped UCP transaction in which an independently
deployed conversational platform discovers a merchant, negotiates the Paze
payment handler, and completes an order without placing payment material in the
model conversation.

## Repository and deployment boundaries

| System | Repository | Local origin | Production responsibility |
|---|---|---|---|
| Merchant | `demo-merchant` | `http://127.0.0.1:5173` | Catalog, authoritative pricing, checkout sessions, private merchant key, payment authorization, orders |
| Agent/platform | `ucp-shopping-agent` | `http://127.0.0.1:5174` and `:8000` | Conversation, UCP discovery/tools, generic handler host interface, explicit buyer confirmation |
| Payment handler | `paze-ucp-payment-handler` | `http://127.0.0.1:5175` | Static browser module, Paze SDK integration, browser choreography, totals mapping, display decoding, instrument contract |

The three systems share no source files or build-time dependencies. The
merchant and agent load the browser handler dynamically from the negotiated
`module_url`. The handler origin is a static host and does not provide a
merchant verifier API.

## Required separation

### Merchant

Merchant changes are limited to UCP business capabilities and a thin payment
handler integration:

- advertise catalog, checkout, and supported payment-handler configuration;
- recompute catalog, shipping, tax, and totals server-side;
- accept the handler instrument through the standard UCP checkout-complete route;
- verify/decrypt the selected credential internally with the merchant key and
  create the order, all within the standard UCP checkout-complete operation;
- expose redacted evidence on the merchant order page for the demo.

The merchant owns the Paze-specific credential validation, JWS/JWE processing,
redaction, and authorization required to consume the payment instrument. It
does not expose a Paze-specific API endpoint.

### Agent/platform

The platform declares Paze as one supported handler, but otherwise remains
handler-agnostic:

- discover the merchant profile and intersect supported handlers;
- load each negotiated browser module through the generic interface;
- render the agent response before invoking `select()`, with a buyer-activated
  fallback if the browser blocks the deferred consumer-present UI;
- render generic masked display and address data;
- after explicit confirmation, invoke `complete()` and submit the resulting
  instrument through standard UCP completion outside model state.

The agent contains no Paze SDK URLs, types, action codes, payload parsing,
instrument construction, or merchant-specific handler identifiers.

### Paze handler

The handler repository owns:

- UCP config and instrument schemas;
- business, platform, and response handler-schema variants composed from the
  UCP 2026-04-08 base schemas;
- handler identifiers and credential semantics;
- Paze SDK loading, initialization, checkout, card change, and completion;
- UCP totals to Paze transaction mapping;
- checkout-response display decoding;
- instrument construction and validation;
- a five-minute platform-visible credential expiry;
- browser-module and instrument-contract tests.

## Transaction flow

1. The platform discovers the merchant's `/.well-known/ucp` profile.
2. Merchant and platform payment-handler declarations are intersected.
3. The chat preloads the handler-owned ES module and initializes it with the
   merchant's public handler configuration.
4. The agent searches the merchant catalog and creates a server-priced checkout.
5. When the buyer asks to pay, the client renders the agent response and then
   invokes the negotiated module's `select()` method. If the browser blocks the
   deferred launch, the conversation presents an explicit fallback control.
6. The Paze module invokes `DIGITAL_WALLET_SDK.checkout()` and returns only an
   opaque selection plus masked display data.
7. The buyer reviews items, subtotal, shipping, tax, total, card, and shipping
   address in the conversation.
8. After a subsequent explicit confirmation, the module calls Paze `complete()`.
9. Generic platform code sends the handler-created instrument directly to the
   merchant's standard UCP checkout-complete endpoint; the model never receives it.
10. The merchant verifies and decrypts the credential internally with its
    private key, stores the verified result, creates the order, and returns the
    order confirmation from the standard UCP operation.

## Security requirements before production

- Replace in-memory merchant sessions with durable, expiring storage.
- Authenticate platform-to-merchant calls and implement UCP message signatures.
- Require successful verification/decryption before authorization.
- Bind amount, currency, session, handler instance, Paze business `client_id`,
  and payload expiry.
- Enforce single-use payloads and idempotent checkout completion.
- Allowlist handler module origins and deploy them with immutable versioned URLs,
  CSP, TLS, and integrity/release controls.
- Authenticate access to redacted evidence; never expose raw token or cryptogram.
- Publish the package and browser module from an EWS/Paze-controlled namespace
  before using an authoritative `com.paze.*` handler name.

## Verification

- Handler: build plus browser-module and instrument-contract tests.
- Merchant: TypeScript/Vite/Worker build, UCP checkout tests, and merchant-owned
  Paze encryption/decryption/redaction test.
- Agent: TypeScript/Vite build, Python compilation, handler-agnostic tool smoke.
- Manual: Paze UAT wallet selection, change method, explicit completion, order
  permalink, and merchant-side redacted evidence.
