# OffAir Gateway SDK

OffAir Gateway SDK is the public TypeScript SDK for integrating external applications with OffAir Gateway.

Portuguese version: [README.pt-BR.md](./README.pt-BR.md)

## Installation

```bash
npm install @protocol-offair/gateway-sdk
```

## Capabilities

- Create Gateway payment intents.
- Fetch payment intent status.
- Register webhooks.
- Verify signed webhook payloads.
- Parse OffAir/Gateway payment links and Solana Pay-compatible codes.
- Use merchant and admin clients from server-side applications.

## Basic Usage

```ts
import { createAirPayGatewayClient } from "@protocol-offair/gateway-sdk";

const gateway = createAirPayGatewayClient({
  apiBaseUrl: process.env.OFFAIR_GATEWAY_API_BASE_URL!,
  apiKey: process.env.OFFAIR_GATEWAY_API_KEY!,
});

const intent = await gateway.createPaymentIntent({
  amount: "1.5",
  currency: "SOL",
  expiresInSeconds: 3600,
  metadata: { orderId: "order-123" },
});

console.log(intent.intentId);
```

The exported function names still include legacy `AirPay` wording for API compatibility. New documentation should refer to the product as OffAir.

## Development

```bash
npm install
npm run build
npm test
```

## Security

Use merchant API keys only in trusted server-side environments. Do not embed private API keys in public frontend code.
