import { Suspense } from "react";
import { CheckoutFromQuery } from "@/components/checkout-from-query";

export default function CheckoutPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose a customer and product, then pay with a saved card or a new payment method.
        </p>
      </div>
      {/* The query string is request-time data, read on the client. */}
      <Suspense fallback={<p className="text-sm text-slate-500">Loading checkout…</p>}>
        <CheckoutFromQuery />
      </Suspense>
    </>
  );
}
