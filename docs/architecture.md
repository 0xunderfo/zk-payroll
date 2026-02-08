# Private Payroll — Technical Architecture

## Overview

Private Payroll implements a shielded pool architecture. Unlike the previous "slot-based" system, V1 uses a Merkle Tree to store private notes off-chain. The blockchain only knows the Merkle Root and the total amount of funds in the pool. Withdrawals are verified using Zero-Knowledge Proofs of Merkle membership and nullifier uniqueness.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Create Batch │  │ Claim Note   │  │ API Client           │   │
│  │ - Recip List │  │ - Proof Gen  │  │ - Backend calls      │   │
│  │ - Sign Pylod │  │ - WASM Prove │  │ - Status polling     │   │
│  │              │  │ - Zero-fee   │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Hono)                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ /api/batch       │  │ /api/claim   │  │ /api/relayer     │   │
│  │ - Tree Build     │  │ - Verify     │  │ - Plasma Relay   │   │
│  │ - DB Store       │  │ - Reserve    │  │ - Zero-Fee       │   │
│  │ - Root Reg       │  │ - Finalize   │  │ - TX Monitor     │   │
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

## Circuit: `withdraw_requesthash.circom`

### Purpose
Proves that a user owns a note in the Merkle Tree (membership), that the note has not been spent (nullifier), and that the user authorizes a specific withdrawal request (request hash).

### Signals

```circom
// Public inputs (3 total)
signal input root;              // Merkle Root of the note tree
signal input nullifierHash;     // Unique identifier for the note (prevents double-spend)
signal input requestHash;       // Hash of withdrawal parameters (recipient, fee, relayer)

// Private inputs
signal input secret;            // Note secret
signal input nullifier;         // Note nullifier secret
signal input amount;            // Note amount
signal input pathElements[n];   // Merkle path siblings
signal input pathIndices[n];    // Merkle path indices
signal input recipient;         // Destination address
signal input relayer;           // Relayer address
signal input fee;               // Relayer fee
```

### Constraints

1.  **Note Commitment:** `noteCommitment = Poseidon(amount, secret, nullifier)`
2.  **Merkle Membership:** Verify `noteCommitment` exists in `root` using `pathElements` and `pathIndices`.
3.  **Nullifier Derivation:** `nullifierHash = Poseidon(nullifier)`
4.  **Request Hash Validation:**
    *   Recompute `requestHash = Poseidon(root, nullifierHash, recipient, relayer, fee, amount)` (using canonical structure from spec).
    *   Request hash binds the proof to a specific transaction context, preventing malleability.

## Smart Contract: `PrivatePayroll.sol`

### Pool Model

**Step 1: Register Root (Employer/Backend)**
```solidity
function registerRoot(
    uint256 root,
    uint256 batchId,
    uint256 noteCount,
    uint256 totalAmount
) external
```
*   Stores the Merkle Root.
*   Emits `RootRegistered`.
*   Requires `totalAmount` USD to be deposited into the pool.

**Step 2: Reserve Withdrawal (Back/Relayer)**
```solidity
function reserveZeroFeeWithdrawal(
    uint256[8] calldata proof,
    uint256 root,
    uint256 nullifierHash,
    uint256 requestHash,
    uint256 authorizationId // EIP-3009 auth ID
) external
```
*   Verifies Groth16 proof.
*   Checks `nullifierHash` is not spent.
*   Locks `nullifierHash` to `authorizationId` (Pending state).
*   Stores `requestHash` for finalization.

**Step 3: Finalize Withdrawal (Relayer)**
```solidity
function finalizeZeroFeeWithdrawal(
    uint256 nullifierHash,
    uint256 authorizationId
) external
```
*   Checks reservation matches `authorizationId`.
*   Marks `nullifierHash` as SPENT.
*   (Transfer happens via EIP-3009 `transferWithAuthorization` separately, or contract handles it depending on final implementation choice).
    *   *Note: In V1 Spec, the EIP-3009 transfer is executed by the relayer against the Escrow EOA. The contract tracks the pool state.*

### Security Properties

1.  **Privacy:** The blockchain only knows the root. It doesn't know which leaf was spent or the amount (until the withdrawal happens, at which point the amount is visible only if not using a relayer mixer, but V1 focuses on sender privacy).
    *   *Correction per V1 Spec:* The `requestHash` hides the parameters (recipient, amount) during reservation.
2.  **Integrity:** Merkle Proof ensures the note exists.
3.  **Double-Spend Protection:** Nullifier prevents reusing the same note.
4.  **Front-Running Protection:** `requestHash` binds the proof to a specific recipient and relayer.

## Zero-Fee Architecture (Plasma)

### Escrow Model
*   Funds held in an Escrow EOA (externally owned account).
*   Escrow approves `PrivatePayroll` for `transferFrom` (fallback).
*   Escrow signs EIP-3009 authorizations for zero-fee transfers (primary path).

### Withdrawal Flow
1.  **User** generates proof client-side.
2.  **User** sends proof + request params to Backend.
3.  **Backend** validates proof.
4.  **Backend** (as Relayer) calls `reserveZeroFeeWithdrawal` on-chain.
5.  **Backend** executes EIP-3009 transfer from Escrow to Recipient.
6.  **Backend** calls `finalizeZeroFeeWithdrawal` on-chain.

## Persistence

The Backend (Hono + Postgres) is the critical availability layer. It must persist:
1.  **Merkle Tree Structure:** To generate inclusion proofs.
2.  **Note Secrets (Encrypted):** Optionally, or users store them.
3.  **Nullifier State:** To prevent double-spending attempts before they hit the chain.

## Deployed Contracts (Plasma Testnet)

*   PrivatePayroll: `0x058a14e29824a11343663c22974D47f0c6188649`
*   Verifier: `0x778b99c9Ecf72ADBa1A9A6997b0d7C7b8551cB0D`
*   PoseidonT4: `0xe824F3FEE3748027F7E75cCEF76711858826C539`
*   USDT0: `0x502012b361AebCE43b26Ec812B74D9a51dB4D412`
