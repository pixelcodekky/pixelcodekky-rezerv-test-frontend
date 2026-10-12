import type { Metadata } from "next";
import { TransactionsTable } from "@/components/transactions-table";

export const metadata: Metadata = { title: "Transactions · Rezerv" };

export default function TransactionsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Transactions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a customer to see their payments, newest first. Successful payments can be refunded in full through 2C2P.
        </p>
      </div>
      <TransactionsTable />
    </>
  );
}
