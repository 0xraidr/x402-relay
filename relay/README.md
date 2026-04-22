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

## Keypairs (devnet)

Do not commit `*-wallet.json`. Copy `x402-client/.env.example` and `x402-facilitator/.env.example` to `.env` and set `RELAY_*_KEYPAIR_PATH` (or the `*_SECRET_KEY` array). Keep key files only on your machine.

The native examples under `example/x402-solana-examples` use their own `client.json` / wallets — treat those the same way.

### If keys were ever committed to Git

Old commits may still contain leaked files until history is rewritten. After committing these `.gitignore` and `.env` changes, run from the repository root (adjust paths if your filenames differ):

```bash
git filter-repo \
  --path relay/x402-client/payer-wallet.json \
  --path relay/x402-facilitator/facilitator-wallet.json \
  --path example/payer-wallet.json \
  --invert-paths
```

Then force-push any remote: `git push --force-with-lease origin <branch>`. **Anyone** who cloned the old repo should re-clone or reset hard. Rotating devnet keys is still recommended if the repo was public.
