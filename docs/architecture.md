# Private Payroll — Technical Architecture

## Overview

Private Payroll enables private payroll for DAOs using zero-knowledge proofs. The system proves that individual payment amounts sum to a declared total without revealing the individual amounts.

## Architecture Diagram

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
│  │ PrivatePayroll │  │ Groth16      │  │ PoseidonT4       │  │
│  │ - createPayroll  │  │ Verifier     │  │ - On-chain hash  │  │
│  │ - claimPayment   │  │ - BN254      │  │ - Commitment     │  │
│  │ - markClaimed    │  │              │  │   verification   │  │
│  └──────────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Circuit: `payroll_private.circom`

### Purpose
Proves that hidden amounts sum to a public total, while binding each amount to a Poseidon commitment.

### Signals

```circom
// Public inputs (6 total)
signal input totalAmount;           // Sum that must be proven
signal input commitments[5];        // Poseidon(recipient, amount, salt)

// Private inputs
signal input recipients[5];         // Recipient addresses (field elements)
signal input amounts[5];            // Individual payment amounts
signal input salts[5];              // Random salts for commitments
```

### Constraints

1. **Sum constraint:** `amounts[0] + amounts[1] + ... + amounts[4] === totalAmount`
2. **Commitment binding:** For each slot, `Poseidon(recipient, amount, salt) === commitment`
3. **Unused slots:** Set `amount = 0`, commitment still computed but amount doesn't affect sum

### Circuit Stats
- Non-linear constraints: 1,320
- Linear constraints: 1,710
- Proving system: Groth16
- Curve: BN254
- Powers of Tau: `powersOfTau28_hez_final_12.ptau` (supports up to 4,096 constraints)

## Smart Contract: `PrivatePayroll.sol`

### Two-Phase Model

**Phase 1: Create Payroll**
```solidity
function createPayroll(
    uint256[8] calldata proof,      // Groth16 proof
    uint256 totalAmount,            // Public: total USDT
    uint256[5] calldata commitments,// Public: Poseidon hashes
    address[5] calldata recipients  // Recipients for claim verification
) external returns (uint256 payrollId)
```
- Verifies Groth16 proof on-chain
- Transfers `totalAmount` USDT to escrow
- Stores commitments mapped to payroll ID
- Emits `PayrollCreated` event

**Phase 2: Claim Payment**
```solidity
function claimPayment(
    uint256 payrollId,
    uint256 commitmentIndex,
    uint256 amount,
    uint256 salt
) external
```
- Computes `Poseidon(msg.sender, amount, salt)` on-chain
- Verifies computed hash matches stored commitment at index
- Marks commitment as claimed (prevents double-claim)
- Transfers `amount` USDT from escrow to `msg.sender`

### Security Properties

1. **Privacy:** Individual amounts never appear on-chain; only commitments
2. **Integrity:** ZK proof ensures amounts sum correctly
3. **Binding:** Poseidon commitment binds recipient + amount + salt
4. **Non-replayable:** Claimed commitments marked, cannot double-claim

## Salt Derivation

Deterministic salt generation for claim links:

```typescript
async function deriveSalt(
  masterSecret: string,
  recipient: string,
  identifier: string
): Promise<bigint> {
  const { poseidon, F } = await getPoseidon();

  // Hash masterSecret and identifier to field elements
  const secretHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(masterSecret));
  const idHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identifier));

  // Poseidon(secret, recipient, identifier) -> deterministic salt
  const hash = poseidon([BigInt(secretHash), BigInt(recipient), BigInt(idHash)]);
  return F.toObject(hash);
}
```

**Why deterministic salts?**
- Employer can regenerate claim links without storing them
- Lost links can be recovered with master secret
- Different identifier per payroll prevents cross-payroll replay

## Zero-Fee Architecture (Plasma)

### Escrow Model
- Funds held in EOA escrow wallet
- Escrow approves PrivatePayroll contract for `transferFrom`
- Backend controls escrow private key for zero-fee claims

### Gasless Claims (EIP-3009)
```typescript
// Backend signs authorization from escrow
const { authorization, signature } = await signAuthorization(recipient, amount);

// Plasma relayer submits zero-fee transfer
await submitZeroFeeTransfer(userIp, authorization, signature);

// Contract marks claim as complete
await markClaimedZeroFee(payrollId, commitmentIndex, recipient, amount, salt);
```

### Direct Claims (Fallback)
- Recipient calls `claimPayment` directly
- Pays gas in XPL
- Contract pulls from escrow via `transferFrom`

## Proof Generation Flow

```
1. User enters recipients + amounts in UI
2. Frontend sends data to backend (/api/proof/generate)
3. Backend generates deterministic salts + Poseidon commitments
4. Backend runs snarkjs Groth16 prover (Node.js)
5. Backend returns proof, commitments, and claim credentials
6. Frontend submits proof to contract (or via gasless relay)
7. Verifier.sol verifies proof on-chain
8. If valid, funds escrowed with commitments
```

## Proof Format for Solidity

snarkjs produces:
```javascript
{
  pi_a: [x, y, 1],
  pi_b: [[x1, x2], [y1, y2], [1, 0]],
  pi_c: [x, y, 1]
}
```

Solidity expects `uint256[8]` with B-coordinates swapped for BN254:
```javascript
const solidityProof = [
  proof.pi_a[0],      // a.x
  proof.pi_a[1],      // a.y
  proof.pi_b[0][1],   // b[0][1] (swapped!)
  proof.pi_b[0][0],   // b[0][0] (swapped!)
  proof.pi_b[1][1],   // b[1][1] (swapped!)
  proof.pi_b[1][0],   // b[1][0] (swapped!)
  proof.pi_c[0],      // c.x
  proof.pi_c[1],      // c.y
];
```

## Deployed Contracts (Plasma Testnet)

| Contract | Address |
|----------|---------|
| PrivatePayroll | `0x924C2eb2A8Abd7A8afce79b80191da4076Bc0b47` |
| Groth16 Verifier | `0x8Be848B25d4A92ca20DBd77B1c28b5e075b8Bd5a` |
| PoseidonT4 | `0x5F4E76C5b8c6B61419BD2814b951e6C7B5Cbc573` |
| USDT0 | `0x502012b361AebCE43b26Ec812B74D9a51dB4D412` |

## Testing

```bash
# Run contract tests
cd contracts && forge test -vvv

# Output: 8/8 tests passing
```

Test coverage:
- Proof verification
- Payroll creation
- Valid claims
- Double-claim prevention
- Invalid proof rejection
- Commitment mismatch detection
