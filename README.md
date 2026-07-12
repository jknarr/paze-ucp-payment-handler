# Paze UCP Payment Handler

An experimental proposal for integrating Paze with the Universal Commerce
Protocol (UCP) as a consumer-present payment handler.

This repository is an independent demo project. It is not an official Paze or
Early Warning Services (EWS) integration and does not claim authority over the
`com.paze.*` namespace. The long-term intent is for the handler contract and
its authoritative artifacts to be reviewed, adopted, and owned by Paze/EWS.

## Demo approach

The initial demo uses the Paze JavaScript SDK:

1. A UCP business advertises an experimental, merchant-owned handler name.
2. A buyer-side conversational agent negotiates that handler and creates a UCP
   checkout.
3. The agent loads the independently hosted Paze handler browser module through
   its generic payment-handler interface.
4. A real user requests payment conversationally, preserving the browser
   user-gesture chain required by `DIGITAL_WALLET_SDK.checkout()`.
5. The handler calls `checkout()` and `complete()` with the UCP checkout ID as the
   Paze `sessionId`.
6. Deterministic application code constructs the handler-defined UCP payment
   instrument; payment material never enters the model transcript.
7. The platform submits it through the standard UCP checkout-complete endpoint,
   where the merchant validates and consumes the instrument.

Direct Paze mobile API/OAuth integration and iframe embedding are outside the
scope of this demo.

## Repository layout

- `spec/2026-07-11/paze-ucp-payment-handler.md` — versioned handler specification
- `schemas/2026-07-11/handler.schema.json` — handler schema with business,
  platform, and response variants
- `schemas/2026-07-11/types/` — UCP-composed config, instrument, and credential
  schemas
- `examples/business-handler.json` — Jimporium-style business declaration
- `examples/platform-handler.json` — buyer-platform declaration
- `src/browser.ts` — independently hostable generic browser-handler module
- `src/sdk.ts` — Paze SDK loader, types, mapping, and checkout choreography
- `src/contract.ts` — handler constants, types, and instrument validation
- `src/ucp-types.ts` — UCP-derived checkout, total, and address data shapes

UCP totals and postal-address data shapes are derived from the pinned UCP JSON
schemas. The exported browser module is a Paze implementation of a host-owned
runtime interface; that runtime interface is not claimed as a UCP protocol
standard.

## Local handler origin

Run `npm install && npm run dev` to host the browser module at
`http://127.0.0.1:5175/src/browser.ts`. A production build emits
`dist/paze-handler.js`, intended to be hosted on the handler provider's HTTPS
domain. The handler origin is only a static module host and exposes no
merchant-verification API. Each merchant verifies and decrypts the credential
internally while processing the standard UCP checkout completion operation.
Merchant private keys are never sent to the handler origin.

The demo handler is deployed to Cloudflare Workers at:

```text
https://paze.jknarr.workers.dev/paze-handler.js
```

Deploy or update it with `npm run deploy`. The Cloudflare Worker adds the CORS
and cross-origin resource headers required for browser module loading.

Runnable demo components:

- [Jimporium merchant](https://github.com/jknarr/demo-merchant)
- [Standalone Google ADK shopping agent](https://github.com/jknarr/ucp-shopping-agent)

## Status

Release candidate aligned with the UCP `2026-04-08` payment-handler guide. It
remains an experimental proposal until reviewed and adopted by Paze/EWS.
Before publishing `2026-07-11`, commit the release artifacts and push the
immutable `v2026-07-11` tag referenced by the specification and schemas.

Validate locally with:

```bash
npm run validate
```

## License

MIT
