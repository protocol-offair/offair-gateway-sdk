# AirPay Gateway SDK

SDK TypeScript para integrar aplicações externas ao AirPay Gateway.

O pacote cobre o fluxo online do gateway:

- criação de payment intents em SOL;
- consulta de intent;
- registro de webhooks;
- parsing de QR/link/copia-e-cola compatível com Solana Pay e AirPay;
- verificação de assinatura HMAC dos webhooks;
- cliente administrativo opcional para painéis internos.

O SDK não implementa swap, stablecoins, custódia de saldo ou promessa de liquidação fiat.

## Instalação local

```bash
npm install @protocol-offair/gateway-sdk
```

No monorepo AirPay, use o workspace:

```bash
npm --workspace @protocol-offair/gateway-sdk run build
npm --workspace @protocol-offair/gateway-sdk run test
```

## Criar uma fatura SOL

Use o cliente merchant apenas em backend ou ambiente server-side. Não exponha a `apiKey` no frontend público.

```ts
import { createAirPayGatewayClient } from "@protocol-offair/gateway-sdk";

const airpay = createAirPayGatewayClient({
  apiBaseUrl: process.env.AIRPAY_GATEWAY_API_BASE_URL!,
  apiKey: process.env.AIRPAY_GATEWAY_API_KEY!,
});

const intent = await airpay.createPaymentIntent(
  {
    amount: "1.5",
    currency: "SOL",
    expiresInSeconds: 3600,
    metadata: {
      orderId: "order-123",
      customerEmail: "cliente@example.com",
    },
  },
  {
    idempotencyKey: "order-123",
  },
);

console.log(intent.intentId);
console.log(intent.solanaPayUrl);
console.log(intent.airpayUrl);
```

## Consultar status

```ts
const intent = await airpay.getPaymentIntent("pay_123");

if (intent.status === "confirmed") {
  // liberar pedido, atualizar checkout ou aguardar webhook settlement.completed
}
```

## Registrar webhook

```ts
const webhook = await airpay.registerWebhook({
  endpointUrl: "https://merchant.example/webhooks/airpay",
  events: ["payment.confirmed", "payment.expired", "settlement.completed"],
  secret: process.env.AIRPAY_GATEWAY_WEBHOOK_SECRET,
});

console.log(webhook.webhookId);
```

## Verificar assinatura de webhook

O Gateway assina o corpo canônico com:

```txt
sha256 HMAC(secret, `${timestamp}.${body}`)
```

Headers:

- `x-signature`
- `x-timestamp`
- `x-event-id`

Exemplo com Express:

```ts
import { assertGatewayWebhookSignature } from "@protocol-offair/gateway-sdk";

app.post("/webhooks/airpay", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await assertGatewayWebhookSignature({
    payload: req.body.toString("utf8"),
    headers: req.headers,
    secret: process.env.AIRPAY_GATEWAY_WEBHOOK_SECRET!,
  });

  if (event.type === "payment.confirmed") {
    await markOrderAsPaid(event.metadata.orderId, event.txHash);
  }

  res.status(204).send();
});
```

## Ler QR Code ou copia-e-cola

```ts
import { parseAirPayGatewayPaymentCode } from "@protocol-offair/gateway-sdk";

const request = parseAirPayGatewayPaymentCode(copiedOrScannedText);

console.log(request.wallet);
console.log(request.amount);
console.log(request.reference);
console.log(request.intentId);
```

## Cliente administrativo

Use apenas em painéis internos ou workers controlados.

```ts
import { createAirPayGatewayAdminClient } from "@protocol-offair/gateway-sdk";

const admin = createAirPayGatewayAdminClient({
  apiBaseUrl: process.env.AIRPAY_GATEWAY_API_BASE_URL!,
  adminKey: process.env.AIRPAY_GATEWAY_ADMIN_KEY!,
});

const overview = await admin.getOverview();
const pending = await admin.listPaymentIntents({ status: "pending", limit: 50 });
```

## Limites intencionais

- Ativo suportado: `SOL`.
- O SDK não cria carteiras nem assina transações pelo usuário.
- O SDK não promete liquidação offline.
- Chaves merchant/admin devem ficar no servidor do integrador.
