<p align="center">
  <img src="assets/icons/private-payroll-logo.svg" alt="Private Payroll" width="80" height="80" />
</p>

# Private Payroll

Confidential stablecoin payroll using zero-knowledge proofs on Plasma.

> Built at ETH Oxford 2026 | Programmable Cryptography Track + Plasma Bounty

## Overview

Private Payroll enables organizations to pay their team in stablecoins (USDT) while keeping individual payment amounts private. Only the total payroll amount and a Merkle Root are visible on-chain. Individual salaries are shielded notes, verifiable only by the recipient using local ZK proofs.

**Status:** V1 (Pooled Notes). See [`docs/pool-v1-spec.md`](./docs/pool-v1-spec.md) for the authoritative spec.

## Problem

Every DAO and crypto company paying contributors in stablecoins exposes:
- Individual salary amounts (anyone can see what you earn)
- Team compensation structure (pay equity becomes public)
- Total burn rate (competitors see your runway)

This transparency creates real problems: salary negotiations become awkward when everyone knows what everyone else makes, and sensitive financial data is permanently public.

## Solution

1. **Shielded Pool** — Employer deposits total amount and registers a Merkle Root of private notes.
2. **Zero-Knowledge Withdrawals** — Backend generates withdrawal proofs per note claim.
3. **On-Chain Privacy** — The contract never sees recipient addresses or amounts, only the validity of the proof.
4. **Zero-Fee Claims** — Recipients claim via Plasma's gasless USDT transfers.

### How It Works

1. **Employer creates batch** — Signs a payload with recipients and amounts. Backend generates a Merkle Tree.
2. **Root Verification** — Contract registers the Merkle Root and holds total funds.
3. **Recipients claim** — Recipient submits claim token; backend generates the ZK withdrawal proof and relays zero-fee transfer.
4. **Privacy preserved** — The blockchain sees a "spend" of a nullifier, but cannot link it to a specific note or amount in the tree.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Create Flow  │  │ Claim Flow   │  │ API Client           │   │
│  │ - Batch Sign │  │ - Generate   │  │ - Backend calls      │   │
│  │ - EIP-712    │  │   Proof      │  │ - Status polling     │   │
│  │              │  │ - WASM Prove │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Hono)                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ /api/batch       │  │ /api/claim   │  │ /api/relayer     │   │
│  │ - Tree Build     │  │ - Reserve    │  │ - Plasma Relay   │   │
│  │ - Persistence    │  │ - Finalize   │  │ - Zero-Fee       │   │
│  │ - Root Reg       │  │ - Queue      │  │                  │   │
│  └──────────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACTS (Plasma)                     │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ PrivatePayroll   │  │ Groth16      │  │ PoseidonT4       │   │
│  │ - registerRoot   │  │ Verifier     │  │ - On-chain hash  │   │
│  │ - reserveWidth   │  │ - BN254      │  │                  │   │
│  │ - finalizeWith   │  │              │  │                  │   │
│  └──────────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Chain | Plasma (EVM, zero-fee USDT) |
| Circuits | Circom 2.x + Groth16 (Merkle Membership + Nullifier) |
| Hashing | Poseidon T4 |
| Contracts | Solidity 0.8.24 + Foundry |
| Frontend | Next.js 14 + wagmi + viem + RainbowKit |
| Backend | Hono + snarkjs + viem + relayer + db |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, anvil)
- [Circom](https://docs.circom.io/getting-started/installation/) 2.x (for circuit development)

### Local Development

```bash
# 1. Clone and install
git clone https://github.com/0xunderfo/private-payroll.git
cd private-payroll
bun install
cd frontend && bun install && cd ..
cd backend && bun install && cd ..

# 2. Start local blockchain
anvil --port 8545

# 3. Deploy contracts (new terminal)
cd contracts
PRIVATE_KEY=0x... \
  forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 --broadcast

# 4. Mint test USDT
cast send --rpc-url http://127.0.0.1:8545 \
  --private-key 0x... \
  0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6 \
  "mint(address,uint256)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 10000000000

# 5. Start frontend
cd frontend && bun dev
# Open http://localhost:3000

# 6. Start backend (required for tree management + zero-fee claims)
cd backend && bun run dev
# Runs on http://localhost:3001
```

### Plasma Testnet Deployment

```bash
# Set environment variables
export PRIVATE_KEY="your_private_key"
export ESCROW_ADDRESS="your_escrow_wallet"
export DEPLOY_WITHDRAW_VERIFIER=true

# Deploy to Plasma testnet
cd contracts
forge script script/DeployTestnet.s.sol --tc DeployTestnetScript \
  --rpc-url https://testnet-rpc.plasma.to --broadcast

# Update frontend/.env.local with deployed addresses
```

If you want to reuse an existing verifier instead of deploying a new one:

```bash
export DEPLOY_WITHDRAW_VERIFIER=false
export WITHDRAW_VERIFIER_ADDRESS="0x..."
```

### Railway Postgres Setup

Use Railway private-network database URL in backend service env:

```bash
DATABASE_URL=${{ Postgres.DATABASE_URL }}
```

Migrations run automatically on backend startup via `schema_migrations`.

## Demo

Live frontend: https://pvt-payroll.vercel.app

| Video | Description |
|-------|-------------|
| [Pitch Video (60s)](https://...) | Project overview for Programmable Cryptography track |
| [Demo Video (2:30)](https://...) | Full flow demo for Plasma bounty |

## Deployed Contracts (Plasma Testnet)

| Contract | Address |
|----------|---------|
| PrivatePayroll | `0x058a14e29824a11343663c22974D47f0c6188649` |
| Groth16 Verifier | `0x778b99c9Ecf72ADBa1A9A6997b0d7C7b8551cB0D` |
| PoseidonT4 | `0xe824F3FEE3748027F7E75cCEF76711858826C539` |
| USDT0 | `0x502012b361AebCE43b26Ec812B74D9a51dB4D412` |

## Documentation

- [Pool V1 Spec](./docs/pool-v1-spec.md) — **Authoritative Spec** for the pooled architecture.
- [Idea & Implementation](./docs/idea-implementation.md) — Problem, solution, market, and implementation details.
- [Architecture Deep-Dive](./docs/architecture.md) — Circuit design, contract model, security properties.

## Team

- Zek ([@0xunderfo](https://github.com/0xunderfo)) aka zekiblue — LlamaRisk

## License

MIT
