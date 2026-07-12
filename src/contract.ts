import type { UcpPostalAddress } from "./ucp-types";

export const PAZE_HANDLER_NAME = "dev.jknarr.paze_checkout";
export const PAZE_HANDLER_VERSION = "2026-07-11";
export const PAZE_INSTRUMENT_TYPE = "paze";
export const PAZE_CREDENTIAL_TYPE = "paze_encrypted_payload";
export const PAZE_INSTRUMENT_TTL_MS = 5 * 60 * 1000;

export type PazeHandlerConfig = {
  environment: "sandbox" | "production";
  client_id: string;
  profile_id?: string;
  module_url: string;
  client_name?: string;
  supported_currencies: string[];
  supported_intents: Array<"REVIEW_AND_PAY" | "EXPRESS_CHECKOUT">;
  accepted_card_networks?: Array<"VISA" | "MASTERCARD" | "DISCOVER">;
  handler_instance_id?: string;
};

export type PazeDisplay = {
  label?: string;
  card_network?: string;
  pan_last_four?: string;
  buyer_name?: string;
  shipping_address?: UcpPostalAddress;
};

export type PazeSelection = {
  checkout_response: string;
  display: PazeDisplay;
};

export type PazeCompletion = {
  payloadId?: string;
  sessionId?: string;
  securedPayload?: unknown;
  completeResponse?: string;
};

export type PazeInstrument = {
  id: string;
  handler_id: string;
  type: "paze";
  session_id: string;
  selected: true;
  credential: {
    type: "paze_encrypted_payload";
    checkout_response: string;
    complete_response: PazeCompletion;
    expiry: string;
  };
  payload_id?: string;
  display?: PazeDisplay;
};

export function createPazeInstrument(input: {
  sessionId: string;
  handlerId: string;
  selection: PazeSelection;
  completion: PazeCompletion;
  payloadId?: string;
  expiry?: string;
}): PazeInstrument {
  return {
    id: `paze_${input.sessionId}`,
    handler_id: input.handlerId,
    type: PAZE_INSTRUMENT_TYPE,
    session_id: input.sessionId,
    selected: true,
    credential: {
      type: PAZE_CREDENTIAL_TYPE,
      checkout_response: input.selection.checkout_response,
      complete_response: input.completion,
      expiry: input.expiry ?? new Date(Date.now() + PAZE_INSTRUMENT_TTL_MS).toISOString(),
    },
    ...(input.payloadId ? { payload_id: input.payloadId } : {}),
    display: input.selection.display,
  };
}

export function isPazeInstrument(
  value: unknown,
  input: { sessionId: string; handlerId: string },
): value is PazeInstrument {
  if (!value || typeof value !== "object") return false;
  const instrument = value as Partial<PazeInstrument>;
  return (
    instrument.handler_id === input.handlerId &&
    instrument.type === PAZE_INSTRUMENT_TYPE &&
    instrument.session_id === input.sessionId &&
    instrument.credential?.type === PAZE_CREDENTIAL_TYPE &&
    typeof instrument.credential.checkout_response === "string" &&
    typeof instrument.credential.complete_response === "object" &&
    instrument.credential.complete_response !== null &&
    typeof instrument.credential.expiry === "string" &&
    Number.isFinite(Date.parse(instrument.credential.expiry))
  );
}
