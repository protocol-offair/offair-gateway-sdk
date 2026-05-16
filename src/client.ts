import { AirPayGatewayError, AirPayGatewayValidationError } from "./errors";
import type {
  AirPayGatewayAdminClientOptions,
  AirPayGatewayAuthClientOptions,
  AirPayGatewayClientOptions,
  GatewayAdminOverview,
  GatewayConfirmationRequest,
  GatewayConfirmationResponse,
  GatewayListOptions,
  GatewayMerchant,
  GatewaySettlement,
  GatewayWalletAuthChallengeRequest,
  GatewayWalletAuthChallengeResponse,
  GatewayWalletSessionRequest,
  GatewayWalletSessionResponse,
  SupportCampaignPaymentRequest,
  GatewayWebhookDelivery,
  GatewayWebhookRegistration,
  GatewayWebhookRegistrationRequest,
  GatewayWorkerRun,
  PaymentIntent,
  PaymentIntentCreateRequest,
  PaymentIntentStatusResponse,
  RequestOptions,
} from "./types";

type AuthKind = "merchant" | "admin" | "none";

type InternalRequestOptions = RequestOptions & {
  method?: "GET" | "POST";
  auth: AuthKind;
  body?: unknown;
  headers?: Record<string, string>;
};

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new AirPayGatewayValidationError("apiBaseUrl is required.");
  }
  return trimmed;
}

function normalizeGatewayAmount(value: string | number): string {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,9})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new AirPayGatewayValidationError("amount must be a positive decimal with up to 9 decimals.");
  }
  return normalized.replace(/^0+(?=\d)/, "") || "0";
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

class GatewayHttpClient {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly merchantKey?: string;
  private readonly adminKey?: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(
    options: (AirPayGatewayClientOptions | AirPayGatewayAdminClientOptions | AirPayGatewayAuthClientOptions) & {
      authHeader: AuthKind;
    },
  ) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.defaultHeaders = options.headers ?? {};

    if (!this.fetchImpl) {
      throw new AirPayGatewayValidationError("A fetch implementation is required in this runtime.");
    }

    if (options.authHeader === "merchant") {
      this.merchantKey = (options as AirPayGatewayClientOptions).apiKey;
      if (!this.merchantKey?.trim()) {
        throw new AirPayGatewayValidationError("apiKey is required.");
      }
    } else if (options.authHeader === "admin") {
      this.adminKey = (options as AirPayGatewayAdminClientOptions).adminKey;
      if (!this.adminKey?.trim()) {
        throw new AirPayGatewayValidationError("adminKey is required.");
      }
    }
  }

  async request<T>(path: string, options: InternalRequestOptions): Promise<T> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (options.auth === "merchant") {
      if (!this.merchantKey) {
        throw new AirPayGatewayValidationError("Merchant API key is not configured.");
      }
      headers["x-airpay-api-key"] = this.merchantKey;
    } else if (options.auth === "admin") {
      if (!this.adminKey) {
        throw new AirPayGatewayValidationError("Admin key is not configured.");
      }
      headers["x-airpay-admin-key"] = this.adminKey;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      body = JSON.stringify(options.body);
    }

    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: options.signal,
    });

    const text = await response.text();
    const payload = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "detail" in payload
          ? String((payload as { detail: unknown }).detail)
          : `AirPay Gateway request failed with HTTP ${response.status}.`;
      throw new AirPayGatewayError(message, {
        status: response.status,
        statusText: response.statusText,
        details: payload,
      });
    }

    return payload as T;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function createWalletAuthChallengeWithHttp(
  http: GatewayHttpClient,
  request: GatewayWalletAuthChallengeRequest,
  options: Pick<RequestOptions, "signal"> = {},
): Promise<GatewayWalletAuthChallengeResponse> {
  if (!request.walletPublicKey.trim()) {
    throw new AirPayGatewayValidationError("walletPublicKey is required.");
  }
  return http.request<GatewayWalletAuthChallengeResponse>("/v1/auth/wallet/challenge", {
    auth: "none",
    method: "POST",
    signal: options.signal,
    body: {
      walletPublicKey: request.walletPublicKey,
      walletAddress: request.walletAddress,
      walletId: request.walletId,
      audience: request.audience,
    },
  });
}

async function createWalletSessionWithHttp(
  http: GatewayHttpClient,
  request: GatewayWalletSessionRequest,
  options: Pick<RequestOptions, "signal"> = {},
): Promise<GatewayWalletSessionResponse> {
  if (!request.message.trim()) {
    throw new AirPayGatewayValidationError("message is required.");
  }
  if (!request.signature.trim()) {
    throw new AirPayGatewayValidationError("signature is required.");
  }
  if (!request.walletPublicKey.trim()) {
    throw new AirPayGatewayValidationError("walletPublicKey is required.");
  }
  return http.request<GatewayWalletSessionResponse>("/v1/auth/wallet/session", {
    auth: "none",
    method: "POST",
    signal: options.signal,
    body: {
      message: request.message,
      signature: request.signature,
      walletPublicKey: request.walletPublicKey,
      walletAddress: request.walletAddress,
      walletId: request.walletId,
    },
  });
}

export class AirPayGatewayAuthClient {
  private readonly http: GatewayHttpClient;

  constructor(options: AirPayGatewayAuthClientOptions) {
    this.http = new GatewayHttpClient({ ...options, authHeader: "none" });
  }

  async createWalletAuthChallenge(
    request: GatewayWalletAuthChallengeRequest,
    options: Pick<RequestOptions, "signal"> = {},
  ): Promise<GatewayWalletAuthChallengeResponse> {
    return createWalletAuthChallengeWithHttp(this.http, request, options);
  }

  async createWalletSession(
    request: GatewayWalletSessionRequest,
    options: Pick<RequestOptions, "signal"> = {},
  ): Promise<GatewayWalletSessionResponse> {
    return createWalletSessionWithHttp(this.http, request, options);
  }
}

export class AirPayGatewayClient {
  private readonly http: GatewayHttpClient;

  constructor(options: AirPayGatewayClientOptions) {
    this.http = new GatewayHttpClient({ ...options, authHeader: "merchant" });
  }

  async getMerchant(options: Pick<RequestOptions, "signal"> = {}): Promise<GatewayMerchant> {
    return this.http.request<GatewayMerchant>("/v1/merchants/me", {
      auth: "merchant",
      signal: options.signal,
    });
  }

  async createPaymentIntent(request: PaymentIntentCreateRequest, options: RequestOptions = {}): Promise<PaymentIntent> {
    const response = await this.http.request<PaymentIntentStatusResponse>("/v1/payment-intents", {
      auth: "merchant",
      method: "POST",
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
      body: {
        amount: normalizeGatewayAmount(request.amount),
        currency: request.currency ?? "SOL",
        receiveCurrency: request.receiveCurrency,
        payCurrency: request.payCurrency,
        acceptedPayCurrencies: request.acceptedPayCurrencies,
        conversionFeeBps: request.conversionFeeBps,
        metadata: request.metadata ?? {},
        expiresInSeconds: request.expiresInSeconds,
        settlementWallet: request.settlementWallet,
      },
    });
    return response.intent;
  }

  async getPaymentIntent(intentId: string, options: Pick<RequestOptions, "signal"> = {}): Promise<PaymentIntent> {
    if (!intentId.trim()) {
      throw new AirPayGatewayValidationError("intentId is required.");
    }
    const response = await this.http.request<PaymentIntentStatusResponse>(`/v1/payment-intents/${encodeURIComponent(intentId.trim())}`, {
      auth: "merchant",
      signal: options.signal,
    });
    return response.intent;
  }

  async registerWebhook(request: GatewayWebhookRegistrationRequest, options: Pick<RequestOptions, "signal"> = {}): Promise<GatewayWebhookRegistration> {
    if (!request.endpointUrl.trim()) {
      throw new AirPayGatewayValidationError("endpointUrl is required.");
    }
    return this.http.request<GatewayWebhookRegistration>("/v1/webhooks", {
      auth: "merchant",
      method: "POST",
      signal: options.signal,
      body: {
        endpointUrl: request.endpointUrl,
        events: request.events,
        secret: request.secret,
      },
    });
  }

  async createWalletAuthChallenge(
    request: GatewayWalletAuthChallengeRequest,
    options: Pick<RequestOptions, "signal"> = {},
  ): Promise<GatewayWalletAuthChallengeResponse> {
    return createWalletAuthChallengeWithHttp(this.http, request, options);
  }

  async createWalletSession(
    request: GatewayWalletSessionRequest,
    options: Pick<RequestOptions, "signal"> = {},
  ): Promise<GatewayWalletSessionResponse> {
    return createWalletSessionWithHttp(this.http, request, options);
  }
}

export class AirPayGatewayAdminClient {
  private readonly http: GatewayHttpClient;

  constructor(options: AirPayGatewayAdminClientOptions) {
    this.http = new GatewayHttpClient({ ...options, authHeader: "admin" });
  }

  async getOverview(options: Pick<RequestOptions, "signal"> = {}): Promise<GatewayAdminOverview> {
    return this.http.request<GatewayAdminOverview>("/v1/admin/gateway/overview", {
      auth: "admin",
      signal: options.signal,
    });
  }

  async listPaymentIntents(options: GatewayListOptions = {}): Promise<PaymentIntent[]> {
    const response = await this.http.request<{ intents: PaymentIntent[] }>(
      withQuery("/v1/admin/gateway/payment-intents", { limit: options.limit, status: options.status }),
      { auth: "admin", signal: options.signal },
    );
    return response.intents;
  }

  async listSettlements(options: GatewayListOptions = {}): Promise<GatewaySettlement[]> {
    const response = await this.http.request<{ settlements: GatewaySettlement[] }>(
      withQuery("/v1/admin/gateway/settlements", { limit: options.limit, status: options.status }),
      { auth: "admin", signal: options.signal },
    );
    return response.settlements;
  }

  async listWebhookDeliveries(options: GatewayListOptions = {}): Promise<GatewayWebhookDelivery[]> {
    const response = await this.http.request<{ deliveries: GatewayWebhookDelivery[] }>(
      withQuery("/v1/admin/gateway/webhook-deliveries", { limit: options.limit, status: options.status }),
      { auth: "admin", signal: options.signal },
    );
    return response.deliveries;
  }

  async runWorkerOnce(options: Pick<RequestOptions, "signal"> = {}): Promise<GatewayWorkerRun> {
    return this.http.request<GatewayWorkerRun>("/v1/admin/gateway/worker/run-once", {
      auth: "admin",
      method: "POST",
      signal: options.signal,
    });
  }

  async recordConfirmation(request: GatewayConfirmationRequest, options: Pick<RequestOptions, "signal"> = {}): Promise<GatewayConfirmationResponse> {
    return this.http.request<GatewayConfirmationResponse>("/v1/internal/solana/confirmations", {
      auth: "admin",
      method: "POST",
      signal: options.signal,
      body: request,
    });
  }
}

export function createAirPayGatewayClient(options: AirPayGatewayClientOptions): AirPayGatewayClient {
  return new AirPayGatewayClient(options);
}

export function createAirPayGatewayAuthClient(options: AirPayGatewayAuthClientOptions): AirPayGatewayAuthClient {
  return new AirPayGatewayAuthClient(options);
}

export function createAirPayGatewayAdminClient(options: AirPayGatewayAdminClientOptions): AirPayGatewayAdminClient {
  return new AirPayGatewayAdminClient(options);
}

export async function createSupportCampaignPaymentIntent(
  client: AirPayGatewayClient,
  request: SupportCampaignPaymentRequest,
  options: RequestOptions = {},
): Promise<PaymentIntent> {
  const metadata = {
    product: "airpay_support",
    paymentMode: "online_only",
    campaignId: request.campaignId,
    campaignSlug: request.campaignSlug,
    campaignTitle: request.campaignTitle,
    contributionId: request.contributionId,
    creatorWallet: request.creatorWallet,
    receiverWallet: request.receiverWallet,
    senderWallet: request.senderWallet,
    displayName: request.displayName,
    message: request.message,
  };
  return client.createPaymentIntent(
    {
      amount: request.amount,
      currency: "SOL",
      metadata,
      settlementWallet: request.receiverWallet,
      expiresInSeconds: request.expiresInSeconds,
    },
    {
      ...options,
      idempotencyKey: options.idempotencyKey ?? request.contributionId,
    },
  );
}
