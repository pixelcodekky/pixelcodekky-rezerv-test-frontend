import type { NextRequest } from "next/server";

/**
 * frontendReturnUrl: 2C2P sends the browser here after the hosted payment page or 3DS,
 * posting a base64 JSON "paymentResponse". It is unsigned, so it is only used to find the
 * invoice; the result page reads the authoritative status from GET /api/transactions/{invoiceNo}.
 */
export async function POST(request: NextRequest) {
  let paymentResponse: string | null = null;
  try {
    const value = (await request.formData()).get("paymentResponse");
    paymentResponse = typeof value === "string" ? value : null;
  } catch {
    // not a form post
  }
  return redirectToResult(request, paymentResponse ?? request.nextUrl.searchParams.get("paymentResponse"));
}

export async function GET(request: NextRequest) {
  const invoiceNo = request.nextUrl.searchParams.get("invoiceNo");
  if (invoiceNo && isValidInvoiceNo(invoiceNo)) {
    return Response.redirect(new URL(`/result/${invoiceNo}`, request.url), 303);
  }
  return redirectToResult(request, request.nextUrl.searchParams.get("paymentResponse"));
}

function redirectToResult(request: NextRequest, paymentResponse: string | null) {
  const invoiceNo = readInvoiceNo(paymentResponse);
  const target = invoiceNo ? `/result/${invoiceNo}` : "/";
  // 303 so the browser follows the form POST with a GET.
  return Response.redirect(new URL(target, request.url), 303);
}

function readInvoiceNo(paymentResponse: string | null): string | null {
  if (!paymentResponse) return null;
  try {
    const json = JSON.parse(Buffer.from(paymentResponse, "base64").toString("utf8")) as {
      invoiceNo?: unknown;
    };
    return typeof json.invoiceNo === "string" && isValidInvoiceNo(json.invoiceNo)
      ? json.invoiceNo
      : null;
  } catch {
    return null;
  }
}

function isValidInvoiceNo(value: string): boolean {
  return /^[A-Za-z0-9]{1,50}$/.test(value);
}
