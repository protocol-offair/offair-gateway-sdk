import { AirPayGatewayValidationError } from "./errors.js";
import type { AirPayGatewayCurrency, OnlinePaymentRequest, PaymentIntent } from "./types.js";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SUPPORTED_GATEWAY_CURRENCIES: AirPayGatewayCurrency[] = ["SOL", "USDC", "USDT", "BRZ", "OFFAIR"];

function assertSolanaAddress(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AirPayGatewayValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (!SOLANA_ADDRESS_RE.test(normalized)) {
    throw new AirPayGatewayValidationError(`${field} must look like a Solana address.`);
  }
  return normalized;
}

function optionalSolanaAddress(value: unknown, field: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return assertSolanaAddress(value, field);
}

function normalizeAmount(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new AirPayGatewayValidationError("Amount is required.");
  }
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,9})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new AirPayGatewayValidationError("Amount must be a positive decimal with up to 9 decimals.");
  }
  return normalized.replace(/^0+(?=\d)/, "") || "0";
}

function normalizeCurrency(value: unknown): AirPayGatewayCurrency {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "SOL";
  if (!SUPPORTED_GATEWAY_CURRENCIES.includes(normalized as AirPayGatewayCurrency)) {
    throw new AirPayGatewayValidationError(`Unsupported payment currency: ${normalized || "empty"}.`);
  }
  return normalized as AirPayGatewayCurrency;
}

function optionalCurrency(value: unknown): AirPayGatewayCurrency | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return normalizeCurrency(value);
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseAllowedPayCurrencies(value: unknown): AirPayGatewayCurrency[] | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const assets = value
    .split(",")
    .map((item) => normalizeCurrency(item))
    .filter((asset, index, all) => all.indexOf(asset) === index);
  return assets.length ? assets : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferIntentId(params: { memo?: string; message?: string; intentId?: string }): string | undefined {
  if (params.intentId) return params.intentId;
  if (params.memo?.startsWith("pay_")) return params.memo;
  return params.message?.match(/\bpay_[A-Za-z0-9]+\b/)?.[0];
}

function parseSolanaPayUrl(raw: string): OnlinePaymentRequest {
  const payload = raw.trim().slice("solana:".length);
  const [recipientPart, queryPart = ""] = payload.split("?");
  const params = new URLSearchParams(queryPart);
  const wallet = assertSolanaAddress(decodeURIComponent(recipientPart.replace(/^\/+/, "")), "Wallet");
  const amount = normalizeAmount(params.get("amount"));
  const reference = optionalSolanaAddress(params.get("reference"), "Reference");
  const memo = textValue(params.get("memo"));
  const message = textValue(params.get("message"));
  const label = textValue(params.get("label"));
  const intentId = inferIntentId({ memo, message });

  return {
    source: "solana-pay",
    raw,
    wallet,
    amount,
    currency: "SOL",
    reference,
    label,
    message,
    memo,
    intentId,
  };
}

function parseAirPayUrl(raw: string): OnlinePaymentRequest {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AirPayGatewayValidationError("AirPay payment link is invalid.");
  }

  const params = url.searchParams;
  const currency = normalizeCurrency(params.get("currency") ?? "SOL");

  const memo = textValue(params.get("memo")) ?? textValue(params.get("intentId"));
  const message = textValue(params.get("message"));
  const intentId = inferIntentId({ memo, message, intentId: textValue(params.get("intentId")) });

  return {
    source: "airpay-gateway",
    raw,
    wallet: assertSolanaAddress(params.get("wallet") ?? params.get("recipient"), "Wallet"),
    vaultAddress: optionalSolanaAddress(params.get("vaultAddress") ?? params.get("vault"), "Vault"),
    vaultMode: textValue(params.get("vaultMode")) === "pda_vault" ? "pda_vault" : undefined,
    amount: normalizeAmount(params.get("amount")),
    currency,
    solAmount: textValue(params.get("solAmount")),
    receiveAmount: textValue(params.get("receiveAmount")),
    receiveCurrency: optionalCurrency(params.get("receiveCurrency")),
    payCurrency: optionalCurrency(params.get("payCurrency")),
    conversionFeeBps: optionalNumber(params.get("conversionFeeBps")),
    totalFeeBps: optionalNumber(params.get("totalFeeBps")),
    allowedPayCurrencies: parseAllowedPayCurrencies(params.get("allowedPayCurrencies")),
    reference: optionalSolanaAddress(params.get("reference"), "Reference"),
    label: textValue(params.get("label")),
    message,
    memo,
    intentId,
  };
}

function parseJsonPayload(raw: string): OnlinePaymentRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AirPayGatewayValidationError("Payment request is not a supported QR or copied code.");
  }

  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const intent = record?.intent && typeof record.intent === "object" ? (record.intent as Record<string, unknown>) : record;
  if (!intent) {
    throw new AirPayGatewayValidationError("Payment request JSON is empty.");
  }

  const solanaPayUrl = textValue(intent.solanaPayUrl) ?? textValue(intent.solana_pay_url) ?? textValue(intent.qrCode) ?? textValue(intent.qr_code);
  if (solanaPayUrl?.startsWith("solana:")) {
    const request = parseSolanaPayUrl(solanaPayUrl);
    const intentId = textValue(intent.intentId) ?? textValue(intent.intent_id) ?? request.intentId;
    return {
      ...request,
      source: "json",
      raw,
      intentId,
      memo: request.memo ?? intentId,
      label: request.label ?? textValue(intent.label),
    };
  }

  const currency = normalizeCurrency(intent.currency ?? "SOL");

  const intentId = textValue(intent.intentId) ?? textValue(intent.intent_id);
  const memo = textValue(intent.memo) ?? intentId;
  const message = textValue(intent.message);

  return {
    source: "json",
    raw,
    wallet: assertSolanaAddress(intent.wallet ?? intent.recipient ?? intent.toAddress ?? intent.to_address, "Wallet"),
    vaultAddress: optionalSolanaAddress(intent.vaultAddress ?? intent.vault_address, "Vault"),
    vaultMode: textValue(intent.vaultMode ?? intent.vault_mode) === "pda_vault" ? "pda_vault" : undefined,
    amount: normalizeAmount(intent.amount),
    currency,
    solAmount: textValue(intent.solAmount) ?? textValue(intent.sol_amount),
    receiveAmount: textValue(intent.receiveAmount) ?? textValue(intent.receive_amount),
    receiveCurrency: optionalCurrency(intent.receiveCurrency ?? intent.receive_currency),
    payCurrency: optionalCurrency(intent.payCurrency ?? intent.pay_currency),
    conversionFeeBps: optionalNumber(intent.conversionFeeBps ?? intent.conversion_fee_bps),
    totalFeeBps: optionalNumber(intent.totalFeeBps ?? intent.total_fee_bps),
    allowedPayCurrencies: Array.isArray(intent.allowedPayCurrencies)
      ? intent.allowedPayCurrencies.map((asset) => normalizeCurrency(asset)).filter((asset, index, all) => all.indexOf(asset) === index)
      : parseAllowedPayCurrencies(intent.allowedPayCurrencies ?? intent.allowed_pay_currencies),
    reference: optionalSolanaAddress(intent.reference, "Reference"),
    label: textValue(intent.label),
    message,
    memo,
    intentId: inferIntentId({ memo, message, intentId }),
  };
}

export function parseAirPayGatewayPaymentCode(raw: string): OnlinePaymentRequest {
  const normalized = raw.trim();
  if (!normalized) {
    throw new AirPayGatewayValidationError("Paste or scan a payment request first.");
  }
  if (normalized.startsWith("solana:")) {
    return parseSolanaPayUrl(normalized);
  }
  if (normalized.startsWith("airpay://pay")) {
    return parseAirPayUrl(normalized);
  }
  return parseJsonPayload(normalized);
}

export function paymentRequestMemo(request: OnlinePaymentRequest): string | undefined {
  return request.memo ?? request.intentId ?? request.reference;
}

export function buildAirPayPaymentRequestJson(intent: PaymentIntent): string {
  return JSON.stringify({
    intent: {
      intentId: intent.intentId,
      amount: intent.amount,
      currency: intent.currency,
      solAmount: intent.solAmount,
      receiveAmount: intent.receiveAmount,
      receiveCurrency: intent.receiveCurrency,
      payAmount: intent.payAmount,
      payCurrency: intent.payCurrency,
      conversionFeeBps: intent.conversionFeeBps,
      totalFeeBps: intent.totalFeeBps,
      allowedPayCurrencies: intent.acceptedPayCurrencies,
      wallet: intent.wallet,
      vaultAddress: intent.vaultAddress,
      vaultMode: intent.vaultMode,
      reference: intent.reference,
      solanaPayUrl: intent.solanaPayUrl,
      airpayUrl: intent.airpayUrl,
      settlementWallet: intent.settlementWallet,
      expiresAt: intent.expiresAt,
      metadata: intent.metadata,
    },
  });
}
