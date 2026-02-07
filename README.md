# ZK Payroll

Private stablecoin payroll using zero-knowledge proofs on Plasma.

> "Aleo proved enterprises need private payroll. We built it for the 50,000 DAOs that can't wait for enterprise sales cycles."

## Overview

ZK Payroll enables organizations to pay their team in stablecoins (USDT) while keeping individual payment amounts private. Only the total payroll amount is visible on-chain.

### Problem

Every DAO/crypto company paying contributors in stablecoins exposes:
- Individual salary amounts
- Team compensation structure
- Total burn rate

### Solution

1. Total payroll amount is verifiable (public)
2. Individual amounts are hidden (private) via ZK proof
3. Employer uploads CSV, generates proof in-browser, submits to smart contract
4. Contract verifies proof and distributes payments

## Architecture

```
                    ┌─────────────┐
  Employer enters   │  Frontend   │  snarkjs generates
  recipients +      │  (Next.js)  │  Groth16 proof
  amounts           │             │  in browser
                    └──────┬──────┘
                           │
              proof + recipients + total
                           │
                    ┌──────▼──────┐
                    │  ZKPayroll  │  Verifies proof on-chain
                    │  (Solidity) │  Only total is public
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Groth16    │  BN254 pairing check
                    │  Verifier   │  (EVM precompile)
                    └─────────────┘
```

**Privacy guarantee**: Individual salary amounts are private inputs to the ZK circuit. Only `totalAmount` and `recipientCount` are public signals visible on-chain.

## Project Structure

```
zk-payroll/
├── circuits/              # Circom ZK circuits
│   ├── payroll_simple.circom  # Sum verification circuit (5 recipients)
│   ├── payroll.circom         # Full circuit with range checks (8 recipients)
│   ├── input.json             # Test input
│   ├── build/                 # Compiled artifacts (wasm, zkey, r1cs)
│   └── scripts/               # setup.js, prove.js, verify.js
├── contracts/             # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── ZKPayroll.sol      # Main payroll contract
│   │   ├── Verifier.sol       # Groth16 verifier (auto-generated)
│   │   └── interfaces/IERC20.sol
│   ├── script/Deploy.s.sol    # Deploys Verifier + MockUSDT + ZKPayroll
│   └── test/ZKPayroll.t.sol   # Contract tests
├── frontend/              # Next.js frontend
│   ├── app/page.tsx           # Main 3-step UI
│   ├── components/            # PayrollForm, ProofStatus, WalletButton
│   ├── lib/
│   │   ├── wagmi.ts           # Chain + contract config
│   │   ├── proof.ts           # Browser-side ZK proof generation
│   │   └── abi.ts             # Contract ABIs
│   └── public/circuits/       # WASM + zkey for browser proving
├── RUNBOOK.md             # Step-by-step developer guide
└── package.json           # Monorepo root
```

## Quick Start

### Prerequisites

- Bun >= 1.0
- Foundry (forge, cast, anvil)
- Circom 2.x + snarkjs (see [RUNBOOK.md](./RUNBOOK.md))

### Local Demo (Anvil)

```bash
# 1. Install dependencies
cd frontend && bun install && cd ..

# 2. Start local blockchain
anvil --port 8545

# 3. Deploy contracts (in another terminal)
cd contracts
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 --broadcast

# 4. Mint test USDT
cast send --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "mint(address,uint256)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 10000000000

# 5. Start frontend
cd ../frontend && bun dev
# Open http://localhost:3000
```

See [RUNBOOK.md](./RUNBOOK.md) for detailed instructions including circuit compilation and Plasma testnet deployment.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Chain | Plasma (EVM, zero-fee USDT) / Anvil (local) |
| Circuits | Circom 2.0 + snarkjs (Groth16) |
| Contracts | Solidity 0.8.24 + Foundry |
| Frontend | Next.js 14 + wagmi + viem |
| Proving | Browser-side Groth16 via snarkjs |

## How It Works

1. **Enter Payroll**: Upload CSV or manually enter (address, amount) pairs
2. **Generate Proof**: snarkjs generates a Groth16 proof in-browser proving `sum(amounts) == totalAmount`
3. **Approve & Submit**: Two transactions - USDT approval + executePayroll with proof
4. **Verify On-Chain**: Groth16Verifier checks BN254 pairing (EVM precompile at `0x08`)
5. **Distribute**: ZKPayroll transfers USDT to each recipient

## Hackathon

Built at ETH Oxford 2026.

**Tracks:**
- Main: Programmable Cryptography ($10K)
- Sponsor: Plasma Payments Bounty ($5K)

## 2-Minute Pitch Outline

1. **Problem (20s)**: DAOs paying on-chain expose salaries, burn rate, comp structure
2. **Solution (20s)**: ZK Payroll -- upload CSV, ZK proof verifies total, payments execute privately
3. **Live Demo (60s)**: Enter 3 recipients, generate proof, submit, show on explorer -- only total visible
4. **Why Plasma (15s)**: Zero-fee USDT transfers, EVM compatible
5. **Team + Architecture (25s)**: Circom Groth16 + Solidity verifier + Next.js

## Team

- Zek (LlamaRisk)

## License

MIT
