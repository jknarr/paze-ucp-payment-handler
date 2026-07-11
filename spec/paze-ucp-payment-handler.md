# Draft Paze UCP payment handler

## Status and namespace

This document proposes the semantics of a Paze payment handler for UCP. It is
not an official Paze/EWS specification. A demo business must advertise the
contract under a handler identifier and schema URLs controlled by that business.
`com.paze.checkout` is reserved here as a proposed future identifier that only
Paze/EWS can publish authoritatively.

## Interaction model

Paze is a consumer-present wallet. The v1 demo uses the Paze JavaScript SDK on
a merchant-hosted browser page. It does not call the Paze mobile checkout APIs
and does not embed the wallet in an iframe.

The platform returns the handler action to its chat UI as structured data. A
trusted user activation opens the merchant payment page. The merchant page
loads and initializes the SDK before presenting the Paze control. Its click
handler calls `checkout()` synchronously so popup blocking does not break the
wallet launch.

## Proposed configuration

Configuration conforms to `../schemas/config.schema.json` and identifies:

- the public Paze SDK merchant client and profile;
- the merchant-hosted consumer action URL;
- the supported currency, intent, and card networks; and
- the configuration environment.

Credentials, OAuth secrets, private keys, and wallet payloads are never handler
configuration.

## Proposed instrument

The instrument conforms to `../schemas/instrument.schema.json`. It binds the
result of the Paze SDK interaction to one UCP checkout session. Payment material
is handled only by deterministic application code and must not be placed in an
LLM prompt, transcript, URL, or observable tool result.

## Choreography

1. Platform and business negotiate the experimental handler.
2. Business creates a server-priced UCP checkout and returns a human action URL.
3. Buyer opens the merchant-hosted action URL.
4. The Paze button invokes SDK `checkout()` with `sessionId` equal to the UCP
   checkout ID, `actionCode` set to `START_FLOW`, and the negotiated totals.
5. If checkout returns `COMPLETE`, the page displays the masked review data.
6. After buyer confirmation, the page invokes SDK `complete()` with the same
   session ID and authoritative transaction values.
7. The platform stores the result outside model state and submits an opaque,
   single-use instrument reference through UCP completion.
8. The business resolves, verifies, consumes, and authorizes the instrument
   idempotently.

An `INCOMPLETE` result does not create an instrument and leaves the UCP checkout
in its consumer-escalation state.

## Totals mapping

| UCP value | Paze SDK value |
|---|---|
| Currency | `transactionCurrencyCode` |
| Merchandise subtotal minus discounts | `transactionAmount` |
| Merchandise subtotal | `subtotal` |
| Tax total | `taxAmount` |
| Fulfillment/shipping total | `shippingAmount` |

`transactionAmount` is not the grand total.

## Security requirements

- Bind the action, SDK session, instrument, and completion to one UCP checkout.
- Recompute all pricing on the business server.
- Use signed, expiring, single-use action state and allowlisted callback origins.
- Never accept an arbitrary return URL.
- Never put a Paze JWS, JWE, or instrument reference in a URL.
- Keep payment material out of agent events, traces, and conversation state.
- Consume instruments once and make order creation idempotent.
