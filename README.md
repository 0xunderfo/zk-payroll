<p align="center">
  <img src="assets/icons/zkpayroll-logo-minimal.svg" alt="Private Payroll" width="80" height="80" />
</p>

# Private Payroll

Confidential stablecoin payroll using zero-knowledge proofs on Plasma.

> Built at ETH Oxford 2026 | Programmable Cryptography Track + Plasma Bounty

## Overview

Private Payroll enables organizations to pay their team in stablecoins (USDT) while keeping individual payment amounts private. Only the total payroll amount is visible on-chain — individual salaries are hidden behind Poseidon hash commitments and verified with Groth16 proofs.

## Problem

Every DAO and crypto company paying contributors in stablecoins exposes:
- Individual salary amounts (anyone can see what you earn)
- Team compensation structure (pay equity becomes public)
- Total burn rate (competitors see your runway)

This transparency creates real problems: salary negotiations become awkward when everyone knows what everyone else makes, and sensitive financial data is permanently public.

## Solution

1. **Total payroll is verifiable** — The sum of all payments is public and proven correct
2. **Individual amounts are hidden** — Each payment is a Poseidon commitment: `hash(recipient, amount, salt)`
3. **Zero-knowledge proof** — Groth16 proof verifies amounts sum to total without revealing them
4. **Zero-fee claims** — Recipients claim via Plasma's gasless USDT transfers

### How It Works

1. **Employer creates payroll** — Enters addresses and amounts, backend generates ZK proof via snarkjs
2. **Proof verified on-chain** — Contract checks Groth16 proof, stores commitments, escrows USDT
3. **Recipients claim** — Each recipient gets a claim link with their secret salt, claims via zero-fee relayer
4. **Privacy preserved** — Individual amounts never appear on-chain (only at claim time per-recipient)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Create Flow  │  │ Claim Flow   │  │ API Client           │  │
│  │ - Recipients │  │ - Claim link │  │ - Backend calls      │  │
│  │ - Amounts    │  │ - Zero-fee   │  │ - Proof requests     │  │
│  │ - EIP-3009   │  │ - Direct     │  │ - Claim polling      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Hono)                              │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ /api/proof      │  │ /api/claim   │  │ /api/payroll     │  │
│  │ - snarkjs       │  │ - verify     │  │ - escrow addr    │  │
│  │ - Groth16       │  │ - zero-fee   │  │ - gasless create │  │
│  │ - Poseidon      │  │ - status     │  │ - EIP-3009 relay │  │
│  └──────────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACTS (Plasma)                      │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ ZKPayrollPrivate │  │ Groth16      │  │ PoseidonT4       │  │
│  │ - createPayroll  │  │ Verifier     │  │ - On-chain hash  │  │
│  │ - claimPayment   │  │ - BN254      │  │ - Commitment     │  │
│  │ - markClaimed    │  │              │  │   verification   │  │
│  └──────────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Chain | Plasma (EVM, zero-fee USDT) |
| Circuits | Circom 2.x + Groth16 |
| Hashing | Poseidon T4 |
| Contracts | Solidity 0.8.24 + Foundry |
| Frontend | Next.js 14 + wagmi + viem + RainbowKit |
| Backend | Hono + snarkjs + viem (proof gen + relayer) |

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

# 6. Start backend (required for proof generation + zero-fee claims)
cd backend && bun run dev
# Runs on http://localhost:3001
```

### Plasma Testnet Deployment

```bash
# Set environment variables
export PRIVATE_KEY="your_private_key"
export ESCROW_ADDRESS="your_escrow_wallet"

# Deploy to Plasma testnet
cd contracts
forge script script/DeployTestnet.s.sol --tc DeployTestnetScript \
  --rpc-url https://testnet-rpc.plasma.to --broadcast

# Update frontend/.env.local with deployed addresses
```

## Demo

| Video | Description |
|-------|-------------|
| [Pitch Video (2:30)](https://...) | Project overview for Programmable Cryptography track |
| [Demo Video (75s)](https://...) | Full flow demo for Plasma bounty |

## Deployed Contracts (Plasma Testnet)

| Contract | Address |
|----------|---------|
| ZKPayrollPrivate | `0xeE2130Fa435801EB4536eEBCBc9DAF75f2B02051` |
| Groth16 Verifier | `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853` |
| PoseidonT4 | `0x0165878A594ca255338adfa4d48449f69242Eb8F` |
| USDT0 | `0x502012b361AebCE43b26Ec812B74D9a51dB4D412` |

## Documentation

- [Idea & Implementation](./docs/idea-implementation.md) — Problem, solution, market, and implementation details
- [Architecture Deep-Dive](./docs/architecture.md) — Circuit design, contract model, security properties

## Team

- Zek ([@0xunderfo](https://github.com/0xunderfo)) aka zekiblue — LlamaRisk

## License

MIT
