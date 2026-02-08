# Private Payroll — Idea & Implementation

## Problem

**On-chain payroll is a privacy disaster.**

Every DAO, crypto startup, and web3 organization paying contributors in stablecoins exposes sensitive financial data permanently on a public ledger:

- **Individual salaries are public** — Anyone can see exactly what each team member earns
- **Compensation structure is exposed** — Pay equity (or inequity) is visible to competitors, recruits, and the press
- **Burn rate is transparent** — Competitors can calculate your runway and treasury health

This isn't hypothetical. Go to any block explorer, find a known DAO multisig, and you can reconstruct their entire payroll. Who got paid, how much, when.

**Why this matters:**
- Salary negotiations become awkward when everyone knows what everyone else makes
- Top talent may avoid transparent-pay organizations
- Sensitive business information (contractor rates, advisor compensation) becomes public record
- Organizations lose negotiating leverage when their financial position is exposed

Traditional finance solved this decades ago — payroll is confidential. Web3 payroll is stuck in 2015.

## Solution

**Private Payroll hides individual payment amounts while proving the total is correct.**

The core insight: employers need to prove they're paying what they claim (accountability), but individual amounts don't need to be public (privacy).

### How It Works

1. **Employer creates payroll** — Uploads a list of recipients and amounts
2. **ZK proof generated** — Browser generates a Groth16 proof that amounts sum to the declared total
3. **Commitments stored on-chain** — Each payment becomes a Poseidon hash: `hash(recipient, amount, salt)`
4. **Recipients claim privately** — Each recipient gets a secret link to claim their specific amount

**What's public:** Total payroll amount, number of recipients, recipient addresses
**What's private:** Individual payment amounts

### Privacy Guarantee

The zero-knowledge circuit proves:
```
sum(amount_1, amount_2, ..., amount_n) == total_amount
```

Without revealing any individual `amount_i`. The on-chain verifier checks the proof, but never sees the breakdown.

## Market

### Immediate Market: DAOs

- **50,000+ DAOs** currently managing treasuries on-chain
- Combined treasury value exceeds **$25B**
- No privacy-preserving payroll solution exists today

DAOs are the perfect initial market:
- Already paying in stablecoins
- Acutely aware of the transparency problem
- No existing vendor relationships to displace
- Community-driven adoption (one happy user tells their DAO)

### Expansion: Crypto-Native Companies

- Startups paying contractors in USDC/USDT
- Remote teams with global contributors
- Companies wanting to keep compensation confidential from competitors

### Long-Term: Enterprise

Aleo raised $200M+ betting that enterprises need private smart contracts for payroll. They're right about the need, wrong about the timeline. Enterprises won't wait 5 years for a new L1 to mature.

Private Payroll brings private payroll to production-ready EVM chains today.

## Implementation

### Architecture Overview

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    Frontend    │────▶│  ZK Circuits   │────▶│   Contracts    │
│   (Next.js)    │     │   (Circom)     │     │  (Solidity)    │
└────────────────┘     └────────────────┘     └────────────────┘
        │                      │                      │
   CSV upload            Groth16 proof         Verify + escrow
   Claim links           Poseidon hash         Claim payments
```

### ZK Circuit: `payroll_private.circom`

**Public inputs:** `totalAmount`, `commitments[5]`
**Private inputs:** `recipients[5]`, `amounts[5]`, `salts[5]`

The circuit enforces two properties:
1. **Sum constraint:** All amounts add up to the declared total
2. **Commitment binding:** Each `Poseidon(recipient, amount, salt)` matches the stored commitment

This means:
- The employer can't lie about the total (cryptographically proven)
- Each recipient can only claim their specific amount (commitment is binding)
- Individual amounts never appear on-chain (private inputs)

### Smart Contract: `PrivatePayroll.sol`

**Two-phase model:**

**Phase 1 — Create Payroll (Employer)**
- Verifies Groth16 proof on-chain (BN254 pairing precompile)
- Transfers total USDT to escrow
- Stores Poseidon commitments for each recipient

**Phase 2 — Claim Payment (Recipient)**
- Recipient provides `(amount, salt)` — the preimage of their commitment
- Contract computes `Poseidon(msg.sender, amount, salt)`
- If hash matches stored commitment → transfer funds
- Mark commitment as claimed (prevents double-claims)

### Zero-Fee Claims (Plasma)

Private payroll fails if recipients need to buy gas tokens before receiving their salary. Plasma's zero-fee USDT transfers solve this:

- Escrow wallet holds funds and signs EIP-3009 authorizations
- Backend relayer submits transfers to Plasma's gasless endpoint
- Recipients receive USDT without holding any XPL

This is why we built on Plasma — zero-fee stablecoin transfers are essential, not optional.

### Server-Side Proof Generation

ZK proof generation happens on the backend via snarkjs (Node.js). The employer submits payroll data to the backend which generates the proof and returns it along with claim credentials.

- Circuit WASM + proving key loaded server-side
- Proof generation: ~2-3 seconds
- Returns: proof, public signals, commitments, claim credentials

### Security Properties

| Property | Mechanism |
|----------|-----------|
| **Privacy** | Amounts are private inputs; only commitments on-chain |
| **Integrity** | ZK proof ensures amounts sum correctly |
| **Binding** | Poseidon commitment locks recipient + amount + salt |
| **Non-replayable** | Claimed commitments marked; double-claim impossible |
| **Self-custody** | Funds in escrow, not custodied by third party |

## Why Now

1. **ZK tooling is production-ready** — Circom + snarkjs work reliably
2. **Zero-fee chains exist** — Plasma makes gasless claims practical
3. **DAOs need this yesterday** — The transparency problem is well-understood
4. **No incumbent** — First mover in a clear market gap

## What We Built at ETH Oxford

- Full Circom circuit with Poseidon commitments (5 recipients, ~3K constraints)
- Solidity contracts with on-chain Groth16 verification
- Next.js frontend with wallet integration (wagmi + RainbowKit)
- Hono backend for proof generation + zero-fee claim processing via Plasma relayer
- End-to-end flow: create payroll → generate proof → submit → claim

Deployed on Plasma testnet. Ready for mainnet.
