# Private Payroll — Idea & Implementation (V1: Pooled Notes)

## Problem

**On-chain payroll is a privacy disaster.**

Every DAO, crypto startup, and web3 organization paying contributors in stablecoins exposes sensitive financial data permanently on a public ledger:

-   **Individual salaries are public** — Anyone can see exactly what each team member earns
-   **Compensation structure is exposed** — Pay equity (or inequity) is visible to competitors, recruits, and the press
-   **Burn rate is transparent** — Competitors can calculate your runway and treasury health

This transparency creates real problems: salary negotiations become awkward when everyone knows what everyone else makes, and sensitive business information becomes public record.

## Solution

**Private Payroll V1 uses a Shielded Pool architecture to hide individual payment amounts while proving the total is correct.**

The core insight: employers deposit a total amount and register a cryptographic commitment (Merkle Root) to the breakdown. Recipients prove they own a piece of that breakdown without revealing which piece.

### How It Works

1.  **Employer creates batch** — Uploads a list of recipients and amounts.
2.  **Merkle Tree Generation** — Backend constructs a Merkle Tree where each leaf is a private note: `Poseidon(amount, recipient, secret)`.
3.  **Root Registration** — The Merkle Root is registered on-chain. The total payroll amount is deposited into the pool.
4.  **Private Withdrawal** — Each recipient gets a secret note. They generate a ZK Proof to withdraw their funds from the pool.

**What's public:** Total pool balance, Merkle Roots.
**What's private:** Individual payment amounts, who claimed what.

### Privacy Guarantee

The zero-knowledge circuit proves:
1.  **Membership:** "I know a secret note that exists in the registered Merkle Tree."
2.  **Uniqueness:** "This note has not been spent before" (via Nullifier).
3.  **Value:** "The note has value X, and I am sending it to address Y."

The on-chain verifier checks the proof, but never sees the note itself or its position in the tree.

## Market

### Immediate Market: DAOs
-   **50,000+ DAOs** require transparency for treasury monitoring but need privacy for individual contributors.
-   Private Payroll bridges this gap: Public Totals, Private Breakdowns.

### Expansion: Crypto-Native Companies
-   Paying contractors in USDC/USDT globally.
-   Need to keep compensation data confidential from competitors.

## Implementation

### Architecture Overview

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    Frontend    │────▶│  ZK Circuits   │────▶│   Contracts    │
│   (Next.js)    │     │   (Circom)     │     │  (Solidity)    │
└────────────────┘     └────────────────┘     └────────────────┘
        │                      │                      │
   Batch Sign            Merkle Proof          Register Root
   Claim Notes           Nullifier Check       Verify + Release
```

### ZK Circuit: `withdraw_requesthash.circom`

**Public inputs:** `root`, `nullifierHash`, `requestHash`
**Private inputs:** `secret`, `amount`, `pathElements`, `recipient`, `relayer`, `fee`

The circuit enforces:
1.  **Membership:** The note exists in the committed tree.
2.  **Ownership:** The sender knows the secret key for the note.
3.  **Binding:** The withdrawal request (recipient, amount) matches the note.

### Smart Contract: `PrivatePayroll.sol`

**Pool Model:**

*   **Deposit:** Employer registers a Root and funds the pool.
*   **Withdraw:** Recipient submits a Proof. The contract verifies it and releases funds.
    *   **Nullifiers:** Prevent double-spending.
    *   **Request Hash:** Prevents front-running/malleability.

### Zero-Fee Claims (Plasma)

Recipients shouldn't need gas to claim their salary.

1.  **Reserve:** Backend (as Relayer) calls `reserveZeroFeeWithdrawal` with the proof.
2.  **Transfer:** Backend executes an EIP-3009 `transferWithAuthorization` from the Escrow wallet to the Recipient.
3.  **Finalize:** Backend calls `finalizeZeroFeeWithdrawal` to mark the note as spent on-chain.

### Server-Side Tree Management

State management happens on the backend (Hono + Postgres):
-   Stores the Merkle Tree and all notes.
-   Generates inclusion proofs for users.
-   Tracks nullifier status locally to prevent failed transactions.

## Why Now

1.  **ZK tooling is mature** — Circom + snarkjs are stable.
2.  **Privacy is a priority** — "Radical transparency" has limits; salaries are one of them.
3.  **UX is ready** — Gasless relayers make privacy usable for non-experts.

## Status

**V1 (Pooled Notes)** is the current architecture, moving away from the previous slot-based prototype for better privacy and scalability.
