import { describe, expect, it } from "vitest";

import {
  createSupportCampaignPaymentIntent,
  createAirPayGatewayAdminClient,
  createAirPayGatewayAuthClient,
  createAirPayGatewayClient,
  parseAirPayGatewayPaymentCode,
  signGatewayWebhookPayload,
  verifyGatewayWebhookSignature,
} from "./index";
import type { PaymentIntent } from "./types";

const wallet = "11111111111111111111111111111111";
const reference = "22222222222222222222222222222222";

const intent: PaymentIntent = {
  intentId: "pay_test_123",
  amount: "0.010000000",
  currency: "SOL",
  solAmount: "0.010000000",
  vaultAddress: wallet,
  vaultBump: 253,
  vaultMode: "pda_vault",
  checkoutUrl: "https://airpay.example/checkout/pay_test_123",
  status: "pending",
  wallet,
  reference,
  qrCode: `solana:${wallet}?amount=0.010000000&reference=${reference}&memo=pay_test_123`,
  solanaPayUrl: `solana:${wallet}?amount=0.010000000&reference=${reference}&memo=pay_test_123`,
  airpayUrl: `airpay://pay?intentId=pay_test_123&wallet=${wallet}&amount=0.010000000&currency=SOL&reference=${reference}`,
  expiresAt: "2026-05-14T12:00:00Z",
  createdAt: "2026-05-14T11:00:00Z",
  metadata: { orderId: "order-123" },
};

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("AirPayGatewayClient", () => {
  it("creates a SOL payment intent with merchant auth and idempotency", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const client = createAirPayGatewayClient({
      apiBaseUrl: "https://gateway.example/api/",
      apiKey: "merchant_test_key",
      fetch: async (input, init) => {
        calls.push({ input: String(input), init });
        return jsonResponse({ intent });
      },
    });

    const created = await client.createPaymentIntent(
      {
        amount: "0,01",
        metadata: { orderId: "order-123" },
        expiresInSeconds: 900,
        settlementWallet: wallet,
      },
      { idempotencyKey: "order-123" },
    );

    expect(created.intentId).toBe("pay_test_123");
    expect(created.vaultMode).toBe("pda_vault");
    expect(created.vaultAddress).toBe(wallet);
    expect(calls[0].input).toBe("https://gateway.example/api/v1/payment-intents");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>)["x-airpay-api-key"]).toBe("merchant_test_key");
    expect((calls[0].init?.headers as Record<string, string>)["idempotency-key"]).toBe("order-123");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      amount: "0.01",
      currency: "SOL",
      metadata: { orderId: "order-123" },
      expiresInSeconds: 900,
      settlementWallet: wallet,
    });
  });

  it("creates a multi-asset payment intent with receive and payer currencies", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const client = createAirPayGatewayClient({
      apiBaseUrl: "https://gateway.example/api",
      apiKey: "merchant_test_key",
      fetch: async (input, init) => {
        calls.push({ input: String(input), init });
        return jsonResponse({
          intent: {
            ...intent,
            amount: "10",
            currency: "USDC",
            receiveAmount: "50",
            receiveCurrency: "BRZ",
            payCurrency: "USDC",
            solAmount: "0.063271605",
          },
        });
      },
    });

    const created = await client.createPaymentIntent({
      amount: "50",
      currency: "USDC",
      receiveCurrency: "BRZ",
      payCurrency: "USDC",
      acceptedPayCurrencies: ["SOL", "USDC", "OFFAIR"],
      conversionFeeBps: 180,
    });

    expect(created.currency).toBe("USDC");
    expect(created.receiveCurrency).toBe("BRZ");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      amount: "50",
      currency: "USDC",
      receiveCurrency: "BRZ",
      payCurrency: "USDC",
      acceptedPayCurrencies: ["SOL", "USDC", "OFFAIR"],
      conversionFeeBps: 180,
    });
  });

  it("builds AirPay Support funding intents on top of the gateway client", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const client = createAirPayGatewayClient({
      apiBaseUrl: "https://gateway.example/api",
      apiKey: "merchant_test_key",
      fetch: async (input, init) => {
        calls.push({ input: String(input), init });
        return jsonResponse({ intent: { ...intent, settlementWallet: wallet } });
      },
    });

    const created = await createSupportCampaignPaymentIntent(
      client,
      {
        campaignId: "supcamp_123",
        campaignSlug: "airpay-ios",
        campaignTitle: "Ajude o AirPay iOS",
        contributionId: "supcon_123",
        amount: "0.5",
        receiverWallet: wallet,
        creatorWallet: wallet,
        senderWallet: reference,
        displayName: "Arthur",
      },
      { idempotencyKey: "support-supcon-123" },
    );

    expect(created.settlementWallet).toBe(wallet);
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      amount: "0.5",
      currency: "SOL",
      settlementWallet: wallet,
      metadata: {
        product: "airpay_support",
        paymentMode: "online_only",
        campaignId: "supcamp_123",
        campaignSlug: "airpay-ios",
        receiverWallet: wallet,
      },
    });
  });

  it("exposes admin list operations separately from merchant operations", async () => {
    const calls: string[] = [];
    const admin = createAirPayGatewayAdminClient({
      apiBaseUrl: "https://gateway.example/api",
      adminKey: "admin_test_key",
      fetch: async (input) => {
        calls.push(String(input));
        return jsonResponse({ intents: [intent] });
      },
    });

    const intents = await admin.listPaymentIntents({ limit: 25, status: "pending" });

    expect(intents).toHaveLength(1);
    expect(calls[0]).toBe("https://gateway.example/api/v1/admin/gateway/payment-intents?limit=25&status=pending");
  });

  it("creates wallet auth sessions through public AirPay wallet signature endpoints", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const client = createAirPayGatewayAuthClient({
      apiBaseUrl: "https://gateway.example/api/",
      fetch: async (input, init) => {
        calls.push({ input: String(input), init });
        if (String(input).endsWith("/v1/auth/wallet/challenge")) {
          return jsonResponse({
            message: "{\"purpose\":\"airpay-gateway-wallet-login\"}",
            nonce: "nonce_test",
            expiresAt: "2026-05-14T12:05:00Z",
            walletPublicKey: wallet,
          });
        }
        return jsonResponse({
          accessToken: "awt.body.signature",
          tokenType: "airpay-wallet-signature",
          expiresAt: "2026-05-14T23:00:00Z",
          walletPublicKey: wallet,
          walletAddress: wallet,
          walletId: "wallet-1",
        });
      },
    });

    const challenge = await client.createWalletAuthChallenge({
      walletPublicKey: wallet,
      walletAddress: wallet,
      walletId: "wallet-1",
    });
    const session = await client.createWalletSession({
      message: challenge.message,
      signature: "signature_base58",
      walletPublicKey: wallet,
      walletAddress: wallet,
      walletId: "wallet-1",
    });

    expect(session.tokenType).toBe("airpay-wallet-signature");
    expect(calls[0].input).toBe("https://gateway.example/api/v1/auth/wallet/challenge");
    expect(calls[1].input).toBe("https://gateway.example/api/v1/auth/wallet/session");
    expect(calls[0].init?.headers).not.toHaveProperty("x-airpay-api-key");
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      walletPublicKey: wallet,
      walletAddress: wallet,
      walletId: "wallet-1",
    });
  });
});

describe("payment request parsing", () => {
  it("parses Solana Pay links and AirPay JSON payloads", () => {
    const solana = parseAirPayGatewayPaymentCode(intent.solanaPayUrl);
    expect(solana.source).toBe("solana-pay");
    expect(solana.intentId).toBe("pay_test_123");
    expect(solana.wallet).toBe(wallet);

    const json = parseAirPayGatewayPaymentCode(JSON.stringify({ intent }));
    expect(json.source).toBe("json");
    expect(json.intentId).toBe("pay_test_123");
    expect(json.reference).toBe(reference);
  });

  it("parses AirPay multi-asset payment links", () => {
    const request = parseAirPayGatewayPaymentCode(
      `airpay://pay?intentId=pay_multi&wallet=${wallet}&amount=10&currency=USDC&solAmount=0.063271605&receiveAmount=50&receiveCurrency=BRZ&payCurrency=USDC&allowedPayCurrencies=SOL,USDC,OFFAIR&reference=${reference}`,
    );

    expect(request.currency).toBe("USDC");
    expect(request.solAmount).toBe("0.063271605");
    expect(request.receiveCurrency).toBe("BRZ");
    expect(request.allowedPayCurrencies).toContain("OFFAIR");
  });
});

describe("webhook signatures", () => {
  it("signs and verifies AirPay Gateway webhook payloads", async () => {
    const payload = {
      type: "payment.confirmed",
      intentId: "pay_test_123",
      amountGross: "1.000000000",
      gatewayFee: "0.007000000",
      amountNet: "0.993000000",
      txHash: "sig_test",
      settlementId: "set_test",
      createdAt: "2026-05-14T12:00:00Z",
      metadata: { orderId: "order-123" },
    } as const;
    const secret = "super-secret-webhook-key-123";
    const timestamp = 1_778_758_400;
    const signed = await signGatewayWebhookPayload({ payload, secret, timestamp });

    const verification = await verifyGatewayWebhookSignature({
      payload,
      secret,
      headers: {
        "x-signature": signed.signature,
        "x-timestamp": signed.timestamp,
      },
      now: new Date(timestamp * 1000),
    });

    expect(verification.ok).toBe(true);
    expect(verification.event?.intentId).toBe("pay_test_123");
  });
});
