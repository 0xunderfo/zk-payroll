# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private Payroll is a privacy-preserving stablecoin payroll system built for DAOs. It allows employers to pay teams while keeping individual salaries private using zero-knowledge proofs. Only the total payroll amount is visible on-chain; individual amounts are hidden behind Poseidon hash commitments.

**Target Chain:** Plasma (testnet chain ID: 9746) with zero-fee USDT transfers via EIP-3009 relayer.

## Development Commands

```bash
# Root-level commands (from project root)
bun run circuit:compile      # Compile Circom circuit
bun run circuit:setup        # Full setup ceremony (compile + ptau + zkey + verifier export)
bun run contracts:build      # forge build
bun run contracts:test       # forge test -vvv
bun run frontend:dev         # Next.js dev server on port 3000
bun run frontend:build       # Production build

# Backend (from backend/)
cd backend && bun run dev    # Hono server on port 3001 (watches for changes)
cd backend && bun run start  # Production start with tsx

# Contracts deployment
ESCROW_ADDRESS=0x... PRIVATE_KEY=... forge script script/DeployTestnet.s.sol \
  --tc DeployTestnetScript --rpc-url https://testnet-rpc.plasma.to --broadcast

# Single contract test
cd contracts && forge test --match-test testFunctionName -vvv
```

## Architecture

### Three-Layer System

1. **Circuits** (`circuits/`) - Circom ZK circuits with Groth16 proving
   - `payroll_private.circom`: Main circuit proving sum(amounts) == totalAmount and Poseidon(recipient, amount, salt) == commitment for each slot
   - Supports up to 5 recipients per payroll (MAX_RECIPIENTS)
   - Circuit artifacts go to `frontend/public/circuits/` after setup

2. **Contracts** (`contracts/`) - Foundry-based Solidity
   - `PrivatePayroll.sol`: Main contract with two-phase model (employer creates, recipients claim)
   - `Verifier.sol`: Auto-generated Groth16 verifier from snarkjs
   - `PoseidonT4.sol`: Poseidon hash interface (deployed from bytecode)
   - Uses escrow pattern: funds held in EOA, contract has transferFrom approval

3. **Frontend** (`frontend/`) - Next.js 14 with wagmi/viem/RainbowKit
   - `lib/api.ts`: Backend API client for proof generation and claims
   - `lib/wagmi.ts`: Chain config and deployed contract addresses
   - `lib/relayer.ts`: EIP-3009 typed data builders

4. **Backend** (`backend/`) - Hono server for proof generation + zero-fee claims
   - Routes: `/api/proof` (snarkjs proof gen), `/api/claim` (verify + relay), `/api/payroll` (gasless create)
   - `lib/escrow.ts`: Signs EIP-3009 authorizations from escrow wallet
   - `lib/relayer.ts`: Plasma relayer integration for gasless transfers

### Data Flow

1. **Create Payroll:** Employer enters recipients + amounts → backend generates ZK proof via snarkjs → submits proof + commitments + USDT to contract (direct or gasless)
2. **Claim Payment:** Recipient receives claim link with (payrollId, commitmentIndex, amount, salt) → backend verifies → Plasma relayer executes zero-fee transfer → contract marks claimed

### Key Implementation Details

- **Poseidon commitments:** `Poseidon(recipient_address, amount, salt)` - hides individual amounts on-chain
- **Salt derivation:** Can be deterministic (`deriveSalt(masterSecret, recipient, identifier)`) or random
- **Proof format for Solidity:** `uint256[8]` with B coordinates swapped for BN254 pairing
- **Public signals:** `[totalAmount, commitment0, commitment1, commitment2, commitment3, commitment4]`

## Environment Variables

```bash
# .env (contracts)
PRIVATE_KEY=...
ESCROW_ADDRESS=...
PLASMA_TESTNET_RPC=https://testnet-rpc.plasma.to

# frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

# backend/.env
ESCROW_PRIVATE_KEY=...
PRIVATE_PAYROLL_ADDRESS=...
PLASMA_RPC=https://testnet-rpc.plasma.to
```

## Deployed Contracts (Plasma Testnet)

- PrivatePayroll: `0x924C2eb2A8Abd7A8afce79b80191da4076Bc0b47`
- Verifier: `0x8Be848B25d4A92ca20DBd77B1c28b5e075b8Bd5a`
- PoseidonT4: `0x5F4E76C5b8c6B61419BD2814b951e6C7B5Cbc573`
- USDT0: `0x502012b361AebCE43b26Ec812B74D9a51dB4D412`
