export type AirPayGatewayCurrency = "SOL" | "USDC" | "USDT" | "BRZ" | "OFFAIR";

export type PaymentIntentStatus = "pending" | "processing" | "confirmed" | "failed" | "expired";

export type GatewayWebhookEventType =
  | "payment.confirmed"
  | "payment.failed"
  | "payment.expired"
  | "settlement.completed";

export type GatewaySettlementStatus = "pending" | "completed" | "failed" | string;
export type GatewayWebhookDeliveryStatus = "queued" | "delivered" | "failed" | string;

export type GatewayMetadata = Record<string, unknown>;

export interface AirPayGatewayClientOptions {
  apiBaseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface AirPayGatewayAuthClientOptions {
  apiBaseUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface AirPayGatewayAdminClientOptions {
  apiBaseUrl: string;
  adminKey: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface PaymentIntentCreateRequest {
  amount: string | number;
  currency?: AirPayGatewayCurrency;
  receiveCurrency?: AirPayGatewayCurrency;
  payCurrency?: AirPayGatewayCurrency;
  acceptedPayCurrencies?: AirPayGatewayCurrency[];
  conversionFeeBps?: number;
  metadata?: GatewayMetadata;
  expiresInSeconds?: number;
  settlementWallet?: string;
}

export interface PaymentIntent {
  intentId: string;
  amount: string;
  currency: AirPayGatewayCurrency;
  vaultAddress?: string | null;
  vaultBump?: number | null;
  vaultMode?: "pda_vault" | "legacy_temporary_wallet";
  checkoutUrl?: string | null;
  solAmount?: string | null;
  receiveAmount?: string | null;
  receiveCurrency?: AirPayGatewayCurrency | null;
  payAmount?: string | null;
  payCurrency?: AirPayGatewayCurrency | null;
  conversionFee?: string | null;
  conversionFeeBps?: number | null;
  totalFeeBps?: number | null;
  acceptedPayCurrencies?: AirPayGatewayCurrency[];
  status: PaymentIntentStatus;
  wallet: string;
  reference: string;
  qrCode: string;
  solanaPayUrl: string;
  airpayUrl: string;
  settlementWallet?: string | null;
  expiresAt: string;
  createdAt: string;
  metadata: GatewayMetadata;
  txHash?: string | null;
  amountGross?: string | null;
  gatewayFee?: string | null;
  amountNet?: string | null;
}

export interface PaymentIntentStatusResponse {
  intent: PaymentIntent;
}

export interface GatewayWalletAuthChallengeRequest {
  walletPublicKey: string;
  walletAddress?: string | null;
  walletId?: string | null;
  audience?: string | null;
}

export interface GatewayWalletAuthChallengeResponse {
  message: string;
  nonce: string;
  expiresAt: string;
  walletPublicKey: string;
}

export interface GatewayWalletSessionRequest {
  message: string;
  signature: string;
  walletPublicKey: string;
  walletAddress?: string | null;
  walletId?: string | null;
}

export interface GatewayWalletSessionResponse {
  accessToken: string;
  tokenType: "airpay-wallet-signature";
  expiresAt: string;
  walletPublicKey: string;
  walletAddress?: string | null;
  walletId?: string | null;
}

export interface GatewayMerchant {
  merchantId: string;
  name: string;
  settlementWallet: string;
  feeBps: number;
  status: string;
}

export interface GatewayWebhookRegistrationRequest {
  endpointUrl: string;
  events?: GatewayWebhookEventType[];
  secret?: string;
}

export interface GatewayWebhookRegistration {
  webhookId: string;
  endpointUrl: string;
  events: GatewayWebhookEventType[];
  status: "active";
  signingSecret?: string | null;
  createdAt: string;
}

export interface GatewayWebhookEvent {
  type: GatewayWebhookEventType;
  intentId: string;
  amountGross: string;
  gatewayFee: string;
  amountNet: string;
  currency?: AirPayGatewayCurrency;
  solAmount?: string | null;
  receiveAmount?: string | null;
  receiveCurrency?: AirPayGatewayCurrency | null;
  payCurrency?: AirPayGatewayCurrency | null;
  txHash?: string | null;
  settlementId?: string | null;
  createdAt: string;
  metadata: GatewayMetadata;
}

export interface GatewayAdminConfigStatus {
  solanaCluster: string;
  solanaRpcUrl: string;
  settlementDryRun: boolean;
  feeBps: number;
  demoMerchantConfigured: boolean;
  settlementWallet: string;
  feeWallet?: string | null;
  feePayerConfigured: boolean;
  walletSecretConfigured: boolean;
}

export interface GatewayAdminCounts {
  merchants: number;
  pendingIntents: number;
  processingIntents: number;
  confirmedIntents: number;
  expiredIntents: number;
  failedIntents: number;
  pendingSettlements: number;
  completedSettlements: number;
  failedSettlements: number;
  queuedWebhooks: number;
  deliveredWebhooks: number;
  failedWebhooks: number;
}

export interface GatewayAdminOverview {
  config: GatewayAdminConfigStatus;
  counts: GatewayAdminCounts;
  recentIntents: PaymentIntent[];
}

export interface GatewaySettlement {
  settlementId: string;
  intentId: string;
  merchantId: string;
  gross: string;
  gatewayFee: string;
  net: string;
  settlementWallet: string;
  status: GatewaySettlementStatus;
  txHash?: string | null;
  details: GatewayMetadata;
  createdAt: string;
  completedAt?: string | null;
}

export interface GatewayWebhookDelivery {
  deliveryId: string;
  webhookId: string;
  merchantId: string;
  intentId: string;
  eventType: string;
  status: GatewayWebhookDeliveryStatus;
  attempts: number;
  lastError?: string | null;
  payload: GatewayMetadata;
  headers: GatewayMetadata;
  createdAt: string;
  deliveredAt?: string | null;
}

export interface GatewayListOptions {
  limit?: number;
  status?: string;
  signal?: AbortSignal;
}

export interface GatewayWorkerRun {
  expiredIntents: number;
  confirmedIntents: number;
  completedSettlements: number;
  failedSettlements: number;
  deliveredWebhooks: number;
  failedWebhooks: number;
}

export interface GatewayConfirmationRequest {
  intentId: string;
  txHash: string;
  amount: string | number;
  wallet: string;
  reference?: string;
  payerWallet?: string;
  slot?: number;
  confirmedAt?: string;
  raw?: GatewayMetadata;
}

export interface GatewayConfirmationResponse {
  intent: PaymentIntent;
  settlementId: string;
  webhookDeliveries: number;
}

export interface SupportCampaignPaymentRequest {
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  contributionId?: string;
  amount: string | number;
  receiverWallet: string;
  creatorWallet?: string;
  senderWallet?: string;
  displayName?: string;
  message?: string;
  expiresInSeconds?: number;
}

export type OnlinePaymentRequestSource = "solana-pay" | "airpay-gateway" | "json";

export interface OnlinePaymentRequest {
  source: OnlinePaymentRequestSource;
  raw: string;
  wallet: string;
  vaultAddress?: string;
  vaultMode?: "pda_vault" | "legacy_temporary_wallet";
  amount: string;
  currency: AirPayGatewayCurrency;
  solAmount?: string;
  receiveAmount?: string;
  receiveCurrency?: AirPayGatewayCurrency;
  payCurrency?: AirPayGatewayCurrency;
  conversionFeeBps?: number;
  totalFeeBps?: number;
  allowedPayCurrencies?: AirPayGatewayCurrency[];
  reference?: string;
  label?: string;
  message?: string;
  memo?: string;
  intentId?: string;
}
