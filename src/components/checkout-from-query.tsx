"use client";

import { useSearchParams } from "next/navigation";
import { CheckoutForm } from "./checkout-form";

/** Reads ?customerId=&productId= (set by the result page's Go back button) to preselect the checkout. */
export function CheckoutFromQuery() {
  const params = useSearchParams();
  const customerId = toId(params.get("customerId"));
  const productId = toId(params.get("productId"));

  // Keyed so a new preselection starts a fresh checkout, including a new idempotency key.
  return (
    <CheckoutForm
      key={`${customerId ?? ""}-${productId ?? ""}`}
      initialCustomerId={customerId}
      initialProductId={productId}
    />
  );
}

function toId(value: string | null): number | undefined {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : undefined;
}
