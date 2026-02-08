# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private Payroll is a privacy-preserving stablecoin payroll system. It allows employers to pay teams while keeping individual salaries private using zero-knowledge proofs. Only the total payroll amount is visible on-chain; individual amounts are shielded in a Merkle Tree.

**Architecture:** V1 (Pooled Notes)
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

1.  **Circuits** (`circuits/`) - Circom ZK circuits with Groth16 proving
    -   `withdraw_requesthash.circom`: Main circuit proving Merkle membership + Nullifier uniqueness + Request Hash validity.
    -   Supports shielded withdrawals from the pool.
    -   Circuit artifacts go to `frontend/public/circuits/` after setup.

2.  **Contracts** (`contracts/`) - Foundry-based Solidity
    -   `PrivatePayroll.sol`: Pool contract. Stores Merkle Roots.
        -   `registerRoot`: Emits root for off-chain tree tracking.
        -   `reserveZeroFeeWithdrawal`: Locks a nullifier with a request hash (recipient + amount + fee).
        -   `finalizeZeroFeeWithdrawal`: Executes transfer after relayer confirmation.
    -   `Verifier.sol`: Auto-generated Groth16 verifier from snarkjs.
    -   `PoseidonT4.sol`: Poseidon hash interface (deployed from bytecode).

3.  **Frontend** (`frontend/`) - Next.js 14 with wagmi/viem/RainbowKit
    -   `lib/api.ts`: Backend API client for batch creation and claims.
    -   `lib/wagmi.ts`: Chain config and deployed contract addresses.
    -   `lib/prover.ts`: Client-side WASM proof generation (optional/hybrid).

4.  **Backend** (`backend/`) - Hono server for Tree Management + Zero-Fee Claims
    -   Routes: `/api/batch` (create tree), `/api/claim` (reserve/finalize).
    -   **State:** Postgres database (Railway) storing the Merkle Tree, Notes, and Nullifier status.
    -   `lib/relayer.ts`: Plasma relayer integration for gasless transfers.

### Data Flow

1.  **Create Batch:** Employer signs (Recipients + Amounts) → Backend creates Merkle Tree → Backend calls `registerRoot` on-chain (holds total USDT).
2.  **Withdraw:** Recipient generates ZK Proof (My Note is in Root + Nullifier is unused) → Backend calls `reserveZeroFeeWithdrawal` → Backend executes Plasma transfer → Backend calls `finalizeZeroFeeWithdrawal`.

### Key Implementation Details

-   **Shielded Pool:** The contract only knows the Merkle Root. It does not know the individual notes.
-   **Request Hash:** A compact hash `Poseidon(root, nullifierHash, recipient, relayer, fee, amount)` used to lock withdrawals without creating large on-chain calldata.
-   **Persistence:** The Backend is the source of truth for the Merkle Tree.

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
DATABASE_URL=postgres://...
PLASMA_RPC=https://testnet-rpc.plasma.to
```

## Deployed Contracts (Plasma Testnet)

-   PrivatePayroll: `0x058a14e29824a11343663c22974D47f0c6188649`
-   Verifier: `0x778b99c9Ecf72ADBa1A9A6997b0d7C7b8551cB0D`
-   PoseidonT4: `0xe824F3FEE3748027F7E75cCEF76711858826C539`
-   USDT0: `0x502012b361AebCE43b26Ec812B74D9a51dB4D412`
