"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatMoney, newIdempotencyKey } from "@/lib/format";
import { Spinner } from "./spinner";
import type { CheckoutRequest, Customer, CustomerCard, Product } from "@/lib/types";

const NEW_METHOD = "new";

/** initialCustomerId / initialProductId preselect the dropdowns, e.g. when coming back from a failed payment. */
export function CheckoutForm({
  initialCustomerId,
  initialProductId,
}: {
  initialCustomerId?: number;
  initialProductId?: number;
}) {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cards, setCards] = useState<CustomerCard[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [method, setMethod] = useState<string>(NEW_METHOD);

  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Idempotency key generated when the checkout page loads. A retry of the same request reuses it;
  // it is only replaced when the customer changes what they are paying for, because the API
  // rejects a key reused with a different body (409).
  const idempotencyKey = useRef<string | null>(null);
  const keyUsedFor = useRef<string | null>(null);

  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();

    let cancelled = false;
    Promise.all([api.getCustomers(), api.getProducts()])
      .then(([c, p]) => {
        if (cancelled) return;
        setCustomers(c);
        setProducts(p);
        selectCustomer((c.find((x) => x.id === initialCustomerId) ?? c[0])?.id ?? null);
        setProductId((p.find((x) => x.id === initialProductId) ?? p[0])?.id ?? null);
      })
      .catch((e: unknown) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoadingCatalog(false));
    return () => {
      cancelled = true;
    };
  }, [initialCustomerId, initialProductId]);

  // Back button from the 2C2P page restores this page from the bfcache with the button still disabled.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => e.persisted && setSubmitting(false);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function selectCustomer(id: number | null) {
    setCustomerId(id);
    setCards([]);
    setMethod(NEW_METHOD);
    setLoadingCards(id != null);
  }

  useEffect(() => {
    if (customerId == null) return;

    let cancelled = false;
    api
      .getCustomerCards(customerId)
      .then((c) => !cancelled && setCards(c))
      .catch((e: unknown) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoadingCards(false));
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const product = products.find((p) => p.id === productId) ?? null;
  const card = method === NEW_METHOD ? null : (cards.find((c) => String(c.id) === method) ?? null);

  const methodLabel = useMemo(() => {
    if (!product) return "-";
    if (card) return `Saved card ${card.maskedCardNo}`;
    return product.paymentType === "Recurring"
      ? "New card (saved for future payments)"
      : "New payment method";
  }, [product, card]);

  const canCheckout =
    !!customer && !!product && !loadingCatalog && !loadingCards && !submitting && deletingCardId === null;

  async function handleDeleteCard(target: CustomerCard) {
    if (customerId == null || deletingCardId !== null || submitting) return;
    if (!window.confirm(`Remove saved card ${target.maskedCardNo}?`)) return;

    setDeletingCardId(target.id);
    setError(null);
    try {
      await api.deleteCustomerCard(customerId, target.id);
      setCards((prev) => prev.filter((c) => c.id !== target.id));
      setMethod((m) => (m === String(target.id) ? NEW_METHOD : m));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setDeletingCardId(null);
    }
  }

  async function handleCheckout() {
    if (!customer || !product || submitting) return;

    const body: CheckoutRequest = {
      customerId: customer.id,
      productId: product.id,
      ...(card ? { customerCardId: card.id } : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (keyUsedFor.current !== null && keyUsedFor.current !== fingerprint) {
      idempotencyKey.current = newIdempotencyKey();
    }
    idempotencyKey.current ??= newIdempotencyKey();
    keyUsedFor.current = fingerprint;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.checkout(body, idempotencyKey.current);

      console.log(res.redirectUrl);

      if (res.redirectUrl) {
        // Hosted payment page (new method) or 3DS (saved card). Keep the button disabled while leaving.
        window.location.assign(res.redirectUrl);
        return;
      }

      router.push(`/result/${encodeURIComponent(res.invoiceNo)}`);
      // The page stays mounted (hidden) after navigation; coming back starts a new purchase.
      idempotencyKey.current = newIdempotencyKey();
      keyUsedFor.current = null;
      setSubmitting(false);
    } catch (e) {
      setError(messageOf(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Order details</h2>

        <div className="mt-5 space-y-5">
          <Field label="Customer" htmlFor="customer">
            <select
              id="customer"
              className={selectClass}
              value={customerId ?? ""}
              disabled={loadingCatalog || submitting || customers.length === 0}
              onChange={(e) => selectCustomer(Number(e.target.value))}
            >
              {loadingCatalog && <option value="">Loading customers…</option>}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName} ({c.email})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Product" htmlFor="product">
            <select
              id="product"
              className={selectClass}
              value={productId ?? ""}
              disabled={loadingCatalog || submitting || products.length === 0}
              onChange={(e) => setProductId(Number(e.target.value))}
            >
              {loadingCatalog && <option value="">Loading products…</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} - {formatMoney(p.price, p.currency)}
                  {p.paymentType === "Recurring" ? " (Recurring)" : ""}
                </option>
              ))}
            </select>
            {product?.description && (
              <p className="mt-1.5 text-sm text-slate-500">{product.description}</p>
            )}
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Payment method</legend>
            {loadingCards ? (
              <p className="text-sm text-slate-500">Loading saved cards…</p>
            ) : (
              <div className="space-y-2">
                {cards.map((c) => (
                  <MethodOption
                    key={c.id}
                    value={String(c.id)}
                    checked={method === String(c.id)}
                    disabled={submitting || deletingCardId === c.id}
                    onChange={setMethod}
                    title={<span className="font-mono tracking-wide">{c.maskedCardNo}</span>}
                    subtitle={`Saved ${c.paymentChannel ?? "card"} · charged directly, no payment page`}
                    action={
                      <button
                        type="button"
                        onClick={(e) => {
                          // Don't let the click select the card's radio.
                          e.preventDefault();
                          handleDeleteCard(c);
                        }}
                        disabled={submitting || deletingCardId !== null}
                        aria-label={`Remove saved card ${c.maskedCardNo}`}
                        className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                      >
                        {deletingCardId === c.id && <Spinner />}
                        {deletingCardId === c.id ? "Removing…" : "Remove"}
                      </button>
                    }
                  />
                ))}
                <MethodOption
                  value={NEW_METHOD}
                  checked={method === NEW_METHOD}
                  disabled={submitting}
                  onChange={setMethod}
                  title="Pay with a new payment method"
                  subtitle={
                    product?.paymentType === "Recurring"
                      ? "2C2P payment page · card only, saved for future payments"
                      : "2C2P payment page · all available methods"
                  }
                />
              </div>
            )}
          </fieldset>
        </div>
      </section>

      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:sticky md:top-6">
        <h2 className="text-lg font-semibold text-slate-900">Payment summary</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <SummaryRow
            label="Customer"
            value={customer ? `${customer.firstName} ${customer.lastName}` : "-"}
          />
          <SummaryRow label="Product" value={product?.name ?? "-"} />
          <SummaryRow label="Payment type" value={product?.paymentType ?? "-"} />
          <SummaryRow label="Method" value={methodLabel} />
          <SummaryRow label="Currency" value={product?.currency ?? "-"} />
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-slate-200 pt-4">
          <span className="text-sm font-medium text-slate-600">Total</span>
          <span className="text-2xl font-semibold text-slate-900">
            {product ? formatMoney(product.price, product.currency) : "-"}
          </span>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={!canCheckout}
          aria-busy={submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting && <Spinner />}
          {submitting ? "Processing…" : "Checkout"}
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">Payments are processed by 2C2P.</p>
      </aside>
    </div>
  );
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Please try again.";
}

const selectClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100 disabled:text-slate-500";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function MethodOption({
  value,
  checked,
  disabled,
  onChange,
  title,
  subtitle,
  action,
}: {
  value: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  title: React.ReactNode;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked
        ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
        : "border-slate-200 hover:border-slate-300"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="payment-method"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 accent-indigo-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{subtitle}</span>
      </span>
      {action}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
