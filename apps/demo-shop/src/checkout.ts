/** Stable business input. Provider wire field names belong only to the adapter. */
export interface CheckoutInput {
  readonly email: string;
  readonly amountMinor: number;
  readonly currency: "USD";
}

export function parseCheckoutInput(value: unknown): CheckoutInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Checkout input must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !["email", "amountMinor", "currency"].includes(key)) ||
    typeof input.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    typeof input.amountMinor !== "number" ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1 ||
    input.currency !== "USD"
  ) {
    throw new TypeError("Expected an email, positive safe integer amountMinor, and USD currency.");
  }
  return { email: input.email, amountMinor: input.amountMinor, currency: input.currency };
}
