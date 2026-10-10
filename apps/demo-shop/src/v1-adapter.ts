import { parseCheckoutInput } from "./checkout.js";

export interface SyntheticV1Request {
  readonly method: "POST";
  readonly path: "/v1/charges";
  readonly headers: { readonly "content-type": "application/json" };
  readonly body: {
    readonly customer_email: string;
    readonly amount: number;
    readonly currency: "USD";
  };
}

/** Constructs the intentionally unmigrated v1 request. No request is sent. */
export function buildV1CheckoutRequest(value: unknown): SyntheticV1Request {
  const input = parseCheckoutInput(value);
  return {
    method: "POST",
    path: "/v1/charges",
    headers: { "content-type": "application/json" },
    body: { customer_email: input.email, amount: input.amountMinor, currency: input.currency },
  };
}
