// Data shapes derived from the pinned UCP 2026-04-08 JSON schemas. These are
// protocol data types, not a browser-plugin or verifier API defined by UCP.
export type UcpTotal = {
  type: string;
  amount: number;
  display_text?: string;
};

export type UcpPostalAddress = {
  extended_address?: string;
  street_address?: string;
  address_locality?: string;
  address_region?: string;
  address_country?: string;
  postal_code?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
};

export type PazeCheckoutContext = {
  id: string;
  currency: string;
  totals: UcpTotal[];
};
