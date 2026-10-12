"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatMoney, newIdempotencyKey, paymentMethodLabel } from "@/lib/format";
import type { CustomerCard, RetryRequest, Transaction } from "@/lib/types";
import { Spinner } from "./spinner";

// The result always comes from our API (database), never from the redirect query string: the browser can
// return before or after the backend notification. While Pending, the API also reconciles with Payment Inquiry.
const POLL_MS = 3000;
const SLOW_POLL_MS = 10000;
const SLOW_AFTER_MS = 2 * 60 * 1000;

export function TransactionResult({ invoiceNo }: { invoiceNo: string }) {
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function load() {
      try {
        const t = await api.getTransaction(invoiceNo);
        if (cancelled) return;
        setTxn(t);
        setError(null);
        if (t.status !== "Pending") return;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setError(`Transaction ${invoiceNo} was not found.`);
          return;
        }
        setError(e instanceof ApiError ? e.message : "Could not load the payment status.");
      }
      // Keep polling until the status changes; back off once it has been pending for a while.
      timer = setTimeout(load, Date.now() - startedAt > SLOW_AFTER_MS ? SLOW_POLL_MS : POLL_MS);
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invoiceNo]);

  if (!txn) {
    return (
      <Card>
        {error ? (
          <p role="alert" className="text-center text-red-700">
            {error}
          </p>
        ) : (
          <div className="flex items-center justify-center gap-3 text-slate-600">
            <Spinner /> Loading payment status…
          </div>
        )}
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            ← Back to checkout
          </Link>
        </div>
      </Card>
    );
  }

  if (txn.status === "Succeeded") return <Succeeded txn={txn} />;
  if (txn.status === "Failed") return <Failed txn={txn} />;
  return <Processing txn={txn} error={error} />;
}

function Succeeded({ txn }: { txn: Transaction }) {
  return (
    <Card>
      <Header
        tone="success"
        title="Payment succeeded"
        subtitle="Thank you, your payment has been received."
        amount={formatMoney(txn.amount, txn.currency)}
      />
      <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-200 text-sm">
        <Row label="Product" value={txn.productName ?? `#${txn.productId}`} />
        <Row label="Amount" value={formatMoney(txn.amount, txn.currency)} />
        <Row label="Invoice no." value={txn.invoiceNo} mono />
        <Row label="Payment method" value={paymentMethodLabel(txn.paymentChannel)} />
        <Row label="Card / account no." value={txn.maskedCardNo ?? "-"} mono />
        {txn.paidAt && <Row label="Paid at" value={formatDateTime(txn.paidAt)} />}
      </dl>
      <div className="mt-6 text-center">
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Make another payment
        </Link>
      </div>
    </Card>
  );
}

function Failed({ txn }: { txn: Transaction }) {
  const backHref = `/?customerId=${txn.customerId}&productId=${txn.productId}`;
  return (
    <Card>
      <Header
        tone="failure"
        title="Payment failed"
        subtitle={txn.respDesc ?? "The payment was not completed."}
        amount={formatMoney(txn.amount, txn.currency)}
      />
      <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-200 text-sm">
        <Row label="Reason" value={txn.respDesc ?? "-"} />
        {txn.respCode && <Row label="Response code" value={txn.respCode} mono />}
        <Row label="Product" value={txn.productName ?? `#${txn.productId}`} />
        <Row label="Invoice no." value={txn.invoiceNo} mono />
      </dl>
      <RetryPayment txn={txn} />
      <Link
        href={backHref}
        className="mt-3 flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Go back
      </Link>
      <p className="mt-3 text-center text-xs text-slate-400">
        Returns to checkout with the same customer and product selected.
      </p>
    </Card>
  );
}

const NEW_METHOD = "new";

/** Retries the failed payment as a new checkout linked to it, with a saved card or the hosted page. */
function RetryPayment({ txn }: { txn: Transaction }) {
  const router = useRouter();
  const [cards, setCards] = useState<CustomerCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [method, setMethod] = useState<string>(NEW_METHOD);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same rules as checkout: a retry of the same request reuses the key (the API returns the same retry);
  // a different card choice gets a new key, because a key reused with a different body is rejected.
  const idempotencyKey = useRef<string | null>(null);
  const keyUsedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getCustomerCards(txn.customerId)
      .then((list) => {
        if (cancelled) return;
        setCards(list);
        // Preselect the card the failed payment used, if it is still saved.
        if (txn.customerCardId != null && list.some((c) => c.id === txn.customerCardId)) {
          setMethod(String(txn.customerCardId));
        }
      })
      .catch((e: unknown) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoadingCards(false));
    return () => {
      cancelled = true;
    };
  }, [txn.customerId, txn.customerCardId]);

  // Back button from the 2C2P page restores this page from the bfcache with the button still disabled.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => e.persisted && setSubmitting(false);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function retry() {
    if (submitting) return;
    const card = method === NEW_METHOD ? null : cards.find((c) => String(c.id) === method);
    const body: RetryRequest = card ? { customerCardId: card.id } : {};

    const fingerprint = JSON.stringify(body);
    if (keyUsedFor.current !== null && keyUsedFor.current !== fingerprint) {
      idempotencyKey.current = null;
    }
    idempotencyKey.current ??= newIdempotencyKey();
    keyUsedFor.current = fingerprint;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.retryTransaction(txn.invoiceNo, body, idempotencyKey.current);
      if (res.redirectUrl) {
        // Hosted payment page (new method) or 3DS (saved card). Keep the button disabled while leaving.
        window.location.assign(res.redirectUrl);
        return;
      }
      router.push(`/result/${encodeURIComponent(res.invoiceNo)}`);
    } catch (e) {
      // A 4xx is final for this request; let the next attempt use a fresh key.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        idempotencyKey.current = null;
        keyUsedFor.current = null;
      }
      setError(messageOf(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Retry with</legend>
        {loadingCards ? (
          <p className="text-sm text-slate-500">Loading saved cards…</p>
        ) : (
          <div className="space-y-2">
            {cards.map((c) => (
              <RetryOption
                key={c.id}
                value={String(c.id)}
                checked={method === String(c.id)}
                disabled={submitting}
                onChange={setMethod}
                title={<span className="font-mono tracking-wide">{c.maskedCardNo}</span>}
                subtitle={c.id === txn.customerCardId ? "Card used for the failed payment" : "Saved card · charged directly"}
              />
            ))}
            <RetryOption
              value={NEW_METHOD}
              checked={method === NEW_METHOD}
              disabled={submitting}
              onChange={setMethod}
              title="A new payment method"
              subtitle="2C2P payment page"
            />
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={retry}
        disabled={loadingCards || submitting}
        aria-busy={submitting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {submitting && <Spinner />}
        {submitting ? "Processing…" : `Retry payment · ${formatMoney(txn.amount, txn.currency)}`}
      </button>
    </div>
  );
}

function RetryOption({
  value,
  checked,
  disabled,
  onChange,
  title,
  subtitle,
}: {
  value: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checked
        ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
        : "border-slate-200 hover:border-slate-300"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="retry-method"
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
    </label>
  );
}

function messageOf(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
}

function Processing({ txn, error }: { txn: Transaction; error: string | null }) {
  return (
    <Card>
      <Header
        tone="pending"
        title="Processing payment"
        subtitle="Waiting for confirmation from 2C2P. This page updates automatically."
        amount={formatMoney(txn.amount, txn.currency)}
      />
      <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-200 text-sm">
        <Row label="Product" value={txn.productName ?? `#${txn.productId}`} />
        <Row label="Invoice no." value={txn.invoiceNo} mono />
      </dl>
      {error && <p className="mt-4 text-center text-sm text-amber-700">{error} Retrying…</p>}
    </Card>
  );
}

const TONES = {
  success: {
    bg: "bg-emerald-100 text-emerald-600",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  failure: {
    bg: "bg-red-100 text-red-600",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    ),
  },
  pending: { bg: "bg-amber-100 text-amber-600", icon: <Spinner /> },
} as const;

function Header({
  tone,
  title,
  subtitle,
  amount,
}: {
  tone: keyof typeof TONES;
  title: string;
  subtitle: string;
  amount: string;
}) {
  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${TONES[tone].bg}`}>
        {TONES[tone].icon}
      </div>
      <h2 className="mt-4 text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <p className="mt-4 text-3xl font-semibold text-slate-900">{amount}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`text-right font-medium break-all text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      {children}
    </section>
  );
}
