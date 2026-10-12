// Mirrors Rezerv.Application.Dtos (camelCase JSON, enums as strings).

export type PaymentType = "OneTime" | "Recurring";
export type TransactionStatus = "Pending" | "Succeeded" | "Failed";

export interface Customer {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  paymentType: PaymentType;
}

export interface CustomerCard {
  id: number;
  maskedCardNo: string;
  paymentChannel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CheckoutRequest {
  customerId: number;
  productId: number;
  customerCardId?: number;
}

/** Body for retrying a failed payment; without customerCardId the 2C2P hosted page is used. */
export interface RetryRequest {
  customerCardId?: number;
}

export interface CheckoutResponse {
  invoiceNo: string;
  status: TransactionStatus;
  /** Hosted payment page or 3DS URL; null when a saved-card payment needs no redirect. */
  redirectUrl: string | null;
}

export interface Transaction {
  invoiceNo: string;
  status: TransactionStatus;
  amount: number;
  currency: string;
  customerId: number;
  productId: number;
  productName: string | null;
  customerCardId: number | null;
  paymentChannel: string | null;
  maskedCardNo: string | null;
  providerRef: string | null;
  respCode: string | null;
  respDesc: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  /** Refunded so far, including refunds still pending at 2C2P. */
  refundedAmount: number;
  /** What can still be refunded; above 0 only for a succeeded payment. */
  refundableAmount: number;
}

export type RefundStatus = "Pending" | "Succeeded" | "Failed";

/** Void cancels an unsettled payment (full amount); Refund returns money for a settled one. */
export type RefundType = "Void" | "Refund";

export interface Refund {
  id: number;
  invoiceNo: string;
  type: RefundType;
  status: RefundStatus;
  amount: number;
  currency: string;
  reason: string | null;
  providerStatus: string | null;
  providerRef: string | null;
  respCode: string | null;
  respDesc: string | null;
  createdAt: string;
  completedAt: string | null;
}
