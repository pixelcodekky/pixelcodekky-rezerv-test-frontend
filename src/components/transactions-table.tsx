"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatMoney, newIdempotencyKey, paymentMethodLabel } from "@/lib/format";
import type { Customer, Transaction, TransactionStatus } from "@/lib/types";
import { Spinner } from "./spinner";

export function TransactionsTable() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [items, setItems] = useState<Transaction[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update the list (the customer can change while one is in flight).
  const requestId = useRef(0);

  const loadTransactions = useCallback(async (id: number) => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const list = await api.getCustomerTransactions(id);
      if (current === requestId.current) setItems(list);
    } catch (e) {
      if (current === requestId.current) setError(messageOf(e));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getCustomers()
      .then((list) => {
        if (cancelled) return;
        setCustomers(list);
        if (list.length > 0) {
          setCustomerId(list[0].id);
          void loadTransactions(list[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(messageOf(e));
        setLoading(false);
      })
      .finally(() => !cancelled && setLoadingCustomers(false));
    return () => {
      cancelled = true;
    };
  }, [loadTransactions]);

  function selectCustomer(id: number) {
    setCustomerId(id);
    setItems([]);
    void loadTransactions(id);
  }

  const replace = (updated: Transaction) =>
    setItems((prev) => prev.map((t) => (t.invoiceNo === updated.invoiceNo ? updated : t)));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="w-full sm:max-w-sm">
          <label htmlFor="customer" className="mb-1.5 block text-sm font-medium text-slate-700">
            Customer
          </label>
          <select
            id="customer"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
            value={customerId ?? ""}
            disabled={loadingCustomers || customers.length === 0}
            onChange={(e) => selectCustomer(Number(e.target.value))}
          >
            {loadingCustomers && <option value="">Loading customers…</option>}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName} ({c.email})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <p className="text-sm text-slate-500">
            {loading
              ? "Loading…"
              : customerId !== null && `${items.length} transaction${items.length === 1 ? "" : "s"} · newest first`}
          </p>
          <button
            type="button"
            onClick={() => customerId !== null && loadTransactions(customerId)}
            disabled={loading || customerId === null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading && customerId !== null && <Spinner />} Refresh
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">
          {error}
        </p>
      )}

      {!loading && customerId !== null && items.length === 0 && !error && (
        <p className="px-6 py-12 text-center text-sm text-slate-500">
          No transactions for this customer yet.{" "}
          <Link
            href={`/?customerId=${customerId}`}
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Make a payment
          </Link>
        </p>
      )}

      {items.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-3 py-3">Invoice</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Method</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((t) => (
                  <tr key={t.invoiceNo} className="align-top hover:bg-slate-50/60">
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">{formatDateTime(t.createdAt)}</td>
                    <td className="px-3 py-3">
                      <InvoiceLink invoiceNo={t.invoiceNo} />
                    </td>
                    <td className="px-3 py-3 text-slate-900">{t.productName ?? `#${t.productId}`}</td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap text-slate-900">
                      {formatMoney(t.amount, t.currency)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <Method txn={t} />
                    </td>
                    <td className="px-3 py-3">
                      <PaymentBadge status={t.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <RefundCell txn={t} onRefunded={replace} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {items.map((t) => (
              <li key={t.invoiceNo} className="space-y-2 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{t.productName ?? `#${t.productId}`}</p>
                  </div>
                  <p className="font-semibold whitespace-nowrap text-slate-900">{formatMoney(t.amount, t.currency)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <PaymentBadge status={t.status} />
                  <span>{formatDateTime(t.createdAt)}</span>
                  <InvoiceLink invoiceNo={t.invoiceNo} />
                </div>
                <div className="text-sm text-slate-600">
                  <Method txn={t} />
                </div>
                <div className="flex justify-end">
                  <RefundCell txn={t} onRefunded={replace} />
                </div>
              </li>
            ))}
          </ul>

        </>
      )}
    </section>
  );
}

/** Refund state and a Refund button on every row; it is enabled (two-step, full amount) only when refundable. */
function RefundCell({ txn, onRefunded }: { txn: Transaction; onRefunded: (t: Transaction) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // One key per refund attempt: a retry after a network error reuses it, so it cannot refund twice.
  const idempotencyKey = useRef<string | null>(null);

  const canRefund = txn.refundableAmount > 0;
  const blockedReason = canRefund ? null : refundBlockedReason(txn);

  async function refund() {
    setBusy(true);
    setError(null);
    idempotencyKey.current ??= newIdempotencyKey();
    try {
      const result = await api.refundTransaction(txn.invoiceNo, idempotencyKey.current);
      idempotencyKey.current = null;
      setConfirming(false);
      if (result.status === "Failed") {
        setError(result.respDesc ?? "Refund failed.");
        return;
      }
      // Pending refunds are already reserved in refundedAmount on the server.
      onRefunded({
        ...txn,
        refundedAmount: txn.refundedAmount + result.amount,
        refundableAmount: Math.max(0, txn.refundableAmount - result.amount),
      });
      const what = result.type === "Void" ? "Voided" : "Refunded";
      setNotice(
        result.status === "Pending"
          ? `Refund of ${formatMoney(result.amount, result.currency)} submitted; 2C2P is processing it.`
          : `${what} ${formatMoney(result.amount, result.currency)}.`,
      );
    } catch (e) {
      // A 4xx is final for this request; let the next attempt use a fresh key.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) idempotencyKey.current = null;
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {txn.refundedAmount > 0 && <RefundBadge txn={txn} />}

      {confirming && canRefund ? (
        <div className="flex flex-col items-center text-center gap-2">
          <span className="text-xs whitespace-nowrap text-slate-600">
            Refund {formatMoney(txn.refundableAmount, txn.currency)}?
          </span>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={refund}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {busy && <Spinner />} {busy ? "Refunding…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setConfirming(true);
          }}
          disabled={!canRefund}
          title={blockedReason ?? `Refund ${formatMoney(txn.refundableAmount, txn.currency)}`}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
        >
          Refund
        </button>
      )}
      {notice && <p className="max-w-56 text-right text-xs text-emerald-700">{notice}</p>}
      {error && (
        <p role="alert" className="max-w-56 text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Why a row's Refund button is disabled (mirrors the backend rules). */
function refundBlockedReason(txn: Transaction): string {
  if (txn.status === "Pending") return "The payment is still processing";
  if (txn.status === "Failed") return "Only successful payments can be refunded";
  if (txn.refundedAmount > 0) return "Already refunded (or a refund is in progress)";
  return "This payment cannot be refunded";
}

function InvoiceLink({ invoiceNo }: { invoiceNo: string }) {
  return (
    <Link
      href={`/result/${encodeURIComponent(invoiceNo)}`}
      className="font-mono text-xs text-indigo-600 hover:text-indigo-500"
    >
      {invoiceNo}
    </Link>
  );
}

function Method({ txn }: { txn: Transaction }) {
  if (!txn.paymentChannel && !txn.maskedCardNo) return <span className="text-slate-400">-</span>;
  return (
    <span>
      {paymentMethodLabel(txn.paymentChannel)}
      {txn.maskedCardNo && <span className="block font-mono text-xs text-slate-500">{txn.maskedCardNo}</span>}
    </span>
  );
}

const BADGE = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

function PaymentBadge({ status }: { status: TransactionStatus }) {
  const cls = {
    Succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    Failed: "bg-red-50 text-red-700 ring-red-600/20",
    Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  }[status];
  return <span className={`${BADGE} ${cls}`}>{status}</span>;
}

function RefundBadge({ txn }: { txn: Transaction }) {
  const full = txn.refundableAmount <= 0;
  return (
    <span
      className={`${BADGE} bg-slate-100 text-slate-700 ring-slate-500/20`}
      title={`${formatMoney(txn.refundedAmount, txn.currency)} refunded (including any refund still processing)`}
    >
      {full ? "Refunded" : `Refunded ${formatMoney(txn.refundedAmount, txn.currency)}`}
    </span>
  );
}

function messageOf(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
}
