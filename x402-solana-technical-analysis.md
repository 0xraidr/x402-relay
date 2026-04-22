# x402 on Solana — Technical Analysis

**Repository layout:** runnable apps for this workspace live under `relay/` (`relay/x402-server`, `relay/x402-facilitator`, `relay/x402-client`). The reference code in `example/x402-solana-examples` is the upstream-style examples.

## 1. Protocol Overview

x402 is an open payment protocol that realizes the HTTP 402 "Payment Required" status code. Incubated by the Coinbase Development Platform, it enables any web service to charge for API/content access via pay-per-use micropayments — no accounts, no subscriptions, no OAuth. On Solana, x402 leverages sub-cent transaction costs and ~400ms finality to make true machine-to-machine commerce viable at scale.

**Current traction (Solana):** 37M+ transactions, 20K+ buyers/sellers, ~70% of monthly x402 volume on Solana.

---

## 2. Core Payment Flow

```
Client  →  GET /protected
Server  →  402 Payment Required  (JSON: PaymentRequirements)
Client  →  GET /protected  +  X-PAYMENT header (base64-encoded signed tx)
Server  →  Verify → Settle on-chain → 200 OK + content + receipt
```

The flow is stateless and mirrors HTTP auth patterns. Two protocol versions exist:

| | v1 | v2 |
|---|---|---|
| Payment header | `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| Network format | `solana-devnet` | CAIP-2 (`solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`) |
| Amount field | `maxAmountRequired` | `amount` |
| Response body | `x402Version: 1` | `x402Version: 2` |

Both versions are live; SDK support varies.

---

## 3. Architecture: Three Components

### 3a. Facilitator (optional but recommended)
Abstracts blockchain complexity from the server. Exposes three endpoints:
- **`/verify`** — Validates payment payload without broadcasting (pre-flight check)
- **`/settle`** — Signs and submits the transaction on-chain
- **`/supported`** — Advertises capabilities (networks, schemes, fee-payer address)

On Solana, **Kora** (a Solana signer node) can serve as the facilitator backend, providing gasless transactions and fee abstraction (users pay in USDC, no SOL needed for gas).

### 3b. Server (Merchant)
Uses middleware (Express, Next.js, Fastify) to intercept requests:
- Returns 402 + `PaymentRequirements` when no payment is present
- Validates/settles payment via facilitator
- Delivers content on success

### 3c. Client (Payer)
Uses a fetch wrapper that:
- Detects 402 responses
- Constructs a Solana transaction (USDC SPL transfer)
- Signs with wallet (Phantom, Privy, keypair, etc.)
- Retries with `X-PAYMENT` / `PAYMENT-SIGNATURE` header

---

## 4. Payment Schemes on Solana

### Scheme 1: `exact` (on-chain)
- Client creates a USDC SPL token transfer transaction
- Server/facilitator verifies and submits on-chain
- **Latency:** 400–800ms
- **Cost:** ~$0.0005 per payment
- Best for: sporadic, low-frequency API calls

### Scheme 2: `channel` (off-chain, emerging)
- Client and server open an on-chain payment channel (PDA)
- Subsequent payments are Ed25519-signed claims verified off-chain
- Only 2 on-chain txs total (open + close)
- **Latency:** <10ms
- **Cost:** $0 per payment (after channel setup)
- Best for: high-frequency (100+ req/hr), streaming, AI billing
- ⚠️ Beta/unaudited — not production-ready

---

## 5. SVM vs EVM: Why Solana

| Metric | EVM (ERC-8004) | SVM (SOL-402) | Improvement |
|---|---|---|---|
| Payment finality | ~12 sec | ~0.4 sec | 30× |
| Tx cost (payment) | $0.50–$5.00 | $0.0005 | 1,000–10,000× |
| TPS capacity | ~15 | ~4,000 real | 267× |
| Parallel execution | No | Yes (Sealevel) | Native |
| Signing | EIP-712 / ECDSA | Ed25519 | Faster verify |
| Identity | ERC-721 | Metaplex NFT (PDA) | Native |
| Name service | ENS | SNS (Bonfida) | Integrated |

---

## 6. SDK Ecosystem (Solana-Ready)

| SDK | Solana Support | Best For | Package |
|---|---|---|---|
| **Coinbase x402** | ✅ (TS full, Python WIP) | Reference implementation | `x402` (npm) |
| **x402-solana** (PayAI) | ✅ v2 compliant | Framework-agnostic client+server | `x402-solana` (npm, 384 wkly dl) |
| **Corbits / Faremeter** | ✅ | Solana-first, production-grade facilitator | `@faremeter/*` |
| **PayAI Facilitator** | ✅ | Turnkey facilitator, absorbs tx fees | Hosted service |
| **@x402-solana/core** | ✅ (v1) | Low-level verification + channel support | `@x402-solana/core` |
| **MCPay.tech** | ✅ | MCP server monetization | Hosted |
| **ACK** | In PR | Agent identity + payment receipts | `agentcommercekit/ack` |
| **A2A x402 (Google)** | In development | Agent-to-agent payments | `google-agentic-commerce/a2a-x402` |
| **Crossmint** | In development | Wallets + onramps | — |
| **Kora** | ✅ | Gasless facilitator backend (Rust) | `solana-foundation/kora` |
| **Native examples** | ✅ | Zero-dependency reference | `Woody4618/x402-solana-examples` |

**Recommendation for building:** Start with `x402-solana` (PayAI) for v2 spec compliance, or Coinbase's `x402` + `x402-express` middleware for quick prototyping. Use Kora as facilitator backend for gasless flows.

---

## 7. SOL-402 Extensions (x402.tech)

The SOL-402 spec (v0.2) extends the base x402 protocol with SVM-native primitives:

- **Identity Registry** — Metaplex NFT-based agent identities with PDA-derived accounts, CAIP-2 addressing
- **Reputation Registry** — On-chain feedback signals, proof-of-payment Sybil resistance
- **Validation Registry** — Pluggable trust models: TEE attestation, zkML proofs, crypto-economic re-execution
- **Agent Discovery** — Multi-strategy: SNS domains, well-known URLs, on-chain lookups, CAIP-10
- **Merchant Agent** — Product catalog with deterministic pricing, A2A agent cards with SOL-402 extensions

These are early-stage but represent the direction toward a full autonomous agent economy.

---

## 8. Key Considerations for Building

### Strengths
- **Micropayments finally viable** — Sub-cent costs enable $0.001-per-call pricing
- **Agent-native** — No human-in-the-loop; Ed25519 signing fits autonomous systems
- **Composable** — Same `verifyX402Payment()` method handles both `exact` and `channel` schemes
- **Gasless possible** — Kora/PayAI can sponsor tx fees; users only need USDC
- **CAIP-2 standard** — Chain-agnostic network identifiers

### Risks & Gaps
- **Protocol version fracture** — v1 and v2 coexist with different header names and payload shapes
- **Channel scheme unaudited** — Off-chain payment channels are beta; no security audit
- **Facilitator centralization** — If your facilitator's wallet empties or goes down, your service stops
- **No refunds/chargebacks** — Blockchain irreversibility; must build manual refund processes
- **Replay attack surface** — Must implement nonce/signature caching (Redis-backed `PaymentCache` recommended)
- **CORS in browsers** — Cross-origin x402 requests require proxy workarounds
- **Ecosystem fragmentation** — 10+ SDKs with differing Solana support maturity; no clear winner yet

### Production Checklist
- [ ] Pin to a single protocol version (v2 recommended)
- [ ] Use a production facilitator (PayAI, Corbits) or self-host Kora with funded signer
- [ ] Implement replay protection (Redis or similar)
- [ ] Set payment expiration windows (≤5 min)
- [ ] Always `/settle` before side-effects if resource has irreversible actions
- [ ] Add idempotent delivery — same payment proof → cached response
- [ ] Log all payment attempts for audit
- [ ] Use mainnet USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkwyTDt1v`

---

## 9. Quick-Start Paths

### Path A: Simplest (Coinbase middleware + PayAI facilitator)
```ts
import { paymentMiddleware } from "x402-express";
app.use(paymentMiddleware(RECIPIENT, {
  "GET /premium": { price: "$0.001", network: "solana-devnet" }
}, { url: "https://facilitator.payai.network" }));
```

### Path B: Full control (x402-solana v2 + self-hosted Kora)
```ts
import { X402PaymentHandler } from "x402-solana/server";
const x402 = new X402PaymentHandler({
  network: "solana-devnet",
  treasuryAddress: process.env.TREASURY!,
  facilitatorUrl: "http://localhost:3000", // your Kora-backed facilitator
});
```

### Path C: Zero dependencies (native)
See `Woody4618/x402-solana-examples` — manual transaction construction, server-side verification, and settlement via `@solana/web3.js`.

---

## 10. Resources

- Spec & docs: [x402.org](https://x402.org) · [x402.gitbook.io](https://x402.gitbook.io/x402)
- Coinbase reference: [github.com/coinbase/x402](https://github.com/coinbase/x402)
- PayAI SDK: [github.com/payainetwork/x402-solana](https://github.com/payainetwork/x402-solana)
- Kora (gasless facilitator): [github.com/solana-foundation/kora](https://github.com/solana-foundation/kora)
- SOL-402 extensions: [x402.tech](https://x402.tech)
- Explorer: [x402scan.com](https://x402scan.com)
- Solana templates: [solana.com/developers/templates](https://solana.com/developers/templates)