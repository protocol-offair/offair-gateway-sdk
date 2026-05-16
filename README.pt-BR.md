# OffAir Gateway SDK

OffAir Gateway SDK é o SDK TypeScript público para integrar aplicações externas ao OffAir Gateway.

Versão em inglês: [README.md](./README.md)

## Instalação

```bash
npm install @protocol-offair/gateway-sdk
```

## Funcionalidades

- Criar payment intents do Gateway.
- Consultar status de payment intents.
- Registrar webhooks.
- Verificar payloads assinados de webhook.
- Interpretar links de pagamento OffAir/Gateway e códigos compatíveis com Solana Pay.
- Usar clientes merchant e admin em aplicações server-side.

## Uso Básico

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

Os nomes exportados ainda contêm `AirPay` por compatibilidade de API. A documentação nova deve tratar o produto como OffAir.

## Desenvolvimento

```bash
npm install
npm run build
npm test
```

## Segurança

Use API keys de merchant apenas em ambientes server-side confiáveis. Não embuta chaves privadas de API em frontend público.
