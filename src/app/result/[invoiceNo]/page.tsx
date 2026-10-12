import { Suspense } from "react";
import type { Metadata } from "next";
import { TransactionResult } from "@/components/transaction-result";

export const metadata: Metadata = { title: "Payment result · Rezerv" };

export default function ResultPage({ params }: PageProps<"/result/[invoiceNo]">) {
  return (
    <Suspense fallback={<p className="text-center text-slate-500">Loading payment status…</p>}>
      {params.then(({ invoiceNo }) => (
        // Keyed so a retry that lands on a new invoice starts with fresh state.
        <TransactionResult key={invoiceNo} invoiceNo={decodeURIComponent(invoiceNo)} />
      ))}
    </Suspense>
  );
}
