# relay — x402 packages

| Package            | Port (default) | Role                                   |
| ----------------- | -------------- | -------------------------------------- |
| `x402-server`     | 4000           | Merchant app (402 + calls facilitator) |
| `x402-facilitator` | 3000          | Verifies and settles on-chain         |
| `x402-client`     | —              | Payer / demo client                    |

## Run from a package directory

```bash
cd relay/x402-facilitator && npx tsx src/index.ts
cd relay/x402-server && npx tsx src/index.ts
cd relay/x402-client && npx tsx src/index.ts
```
