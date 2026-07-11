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
3. The agent presents a structured action pointing to a merchant-hosted Paze
   payment page.
4. A real user activates the Paze button, preserving the browser user-gesture
   chain required by `DIGITAL_WALLET_SDK.checkout()`.
5. The page calls `checkout()` and `complete()` with the UCP checkout ID as the
   Paze `sessionId`.
6. Deterministic application code returns an opaque payment-instrument
   reference to the UCP platform; payment material never enters the model
   transcript.
7. The merchant validates and consumes the instrument during UCP checkout
   completion.

Direct Paze mobile API/OAuth integration and iframe embedding are outside the
scope of this demo.

## Repository layout

- `spec/paze-ucp-payment-handler.md` — proposed handler contract and flow
- `schemas/config.schema.json` — draft handler configuration schema
- `schemas/instrument.schema.json` — draft payment instrument schema

The runnable merchant and conversational client live in separate repositories.

## Status

Early draft. The schemas and choreography must be validated against the pinned
UCP release and reviewed with Paze/EWS before production use.

## License

MIT
