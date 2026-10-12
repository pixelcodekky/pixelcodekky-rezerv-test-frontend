export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// 2C2P channelCode values reported in the notification / inquiry.
const CHANNELS: Record<string, string> = {
  CC: "Credit / debit card",
  VI: "Visa",
  MA: "Mastercard",
  AM: "American Express",
  JC: "JCB",
  UP: "UnionPay",
};

export function paymentMethodLabel(channelCode: string | null): string {
  if (!channelCode) return "-";
  return CHANNELS[channelCode.toUpperCase()] ?? channelCode;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  // The API serialises UTC DateTimes without an offset.
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" });
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. LAN IP over http).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
