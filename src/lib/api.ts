import type {
  CheckoutRequest,
  CheckoutResponse,
  Customer,
  CustomerCard,
  Product,
  Refund,
  RetryRequest,
  Transaction,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "ngrok-skip-browser-warning": "true",
        Accept: "application/json",
        ...init?.headers
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Cannot reach the payment service. Please try again.", 0);
  }

  if (!res.ok) {
    // The API returns RFC 7807 problem details.
    let message = `Request failed (${res.status})`;
    try {
      const problem = (await res.json()) as { title?: string; detail?: string };
      message = problem.detail || problem.title || message;
    } catch {
      // not JSON - keep the generic message
    }
    throw new ApiError(message, res.status);
  }

  // DELETE may answer 204 No Content (or 200 with an empty body) - nothing to parse.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  getCustomers: () => request<Customer[]>("/api/customers"),

  getProducts: () => request<Product[]>("/api/products"),

  getCustomerCards: (customerId: number) =>
    request<CustomerCard[]>(`/api/customers/${customerId}/cards`),

  /** Removes a saved card (its 2C2P token, the MySQL row and the cached card list). */
  deleteCustomerCard: (customerId: number, cardId: number) =>
    request<void>(`/api/customers/${customerId}/cards/${cardId}`, { method: "DELETE" }),

  checkout: (body: CheckoutRequest, idempotencyKey: string) =>
    request<CheckoutResponse>("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),

  /** The customer's transactions, newest first. */
  getCustomerTransactions: (customerId: number) => request<Transaction[]>(`/api/transactions/${customerId}`),

  /** Full refund (no amount = everything not refunded yet). Reusing the Idempotency-Key returns the original refund. */
  refundTransaction: (invoiceNo: string, idempotencyKey: string) =>
    request<Refund>(`/api/transactions/${encodeURIComponent(invoiceNo)}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({}),
    }),

  /** Retries a failed payment as a new checkout (new invoiceNo linked to the failed one). Same key returns the same retry. */
  retryTransaction: (invoiceNo: string, body: RetryRequest, idempotencyKey: string) =>
    request<CheckoutResponse>(`/api/transactions/${encodeURIComponent(invoiceNo)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),

  getTransaction: (invoiceNo: string) =>
    request<Transaction>(`/api/transactions/${encodeURIComponent(invoiceNo)}`),
};
