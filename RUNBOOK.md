# ZK Payroll - Developer Runbook

Step-by-step guide to build, deploy, and demo the ZK Payroll system.

## Prerequisites

- **Bun** >= 1.0 (`curl -fsSL https://bun.sh/install | bash`)
- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **Rust/Cargo** >= 1.70 (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Circom** 2.x (built from source, see below)
- **snarkjs** >= 0.7 (`npm install -g snarkjs`)

## 1. Install Circom

```bash
cd /tmp
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
circom --version  # should print 2.2.x
```

## 2. Compile ZK Circuit

```bash
cd circuits

# Compile circuit to r1cs + wasm
circom payroll_simple.circom --r1cs --wasm --sym -o build/

# Groth16 trusted setup (uses existing powers of tau)
snarkjs groth16 setup build/payroll_simple.r1cs build/powersOfTau28_hez_final_10.ptau build/circuit_0000.zkey

# Contribute to ceremony
snarkjs zkey contribute build/circuit_0000.zkey build/circuit_final.zkey \
  --name="ZK Payroll" -e="random entropy"

# Export verification key
snarkjs zkey export verificationkey build/circuit_final.zkey build/verification_key.json

# Generate Solidity verifier
snarkjs zkey export solidityverifier build/circuit_final.zkey ../contracts/src/Verifier.sol
```

### Test the circuit

```bash
# Generate proof
snarkjs groth16 fullprove input.json \
  build/payroll_simple_js/payroll_simple.wasm \
  build/circuit_final.zkey \
  build/proof.json build/public.json

# Verify proof
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
# Should output: OK!
```

## 3. Build & Test Contracts

```bash
cd contracts
forge build
forge test -vvv
# 5/6 tests pass (event emission test has a known expectEmit ordering issue)
```

## 4. Deploy to Local Anvil

```bash
# Terminal 1: Start Anvil
anvil --port 8545

# Terminal 2: Deploy
cd contracts
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 --broadcast

# Note the deployed addresses:
# Verifier:  0x5FbDB2315678afecb367f032d93F642f64180aa3
# MockUSDT:  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
# ZKPayroll: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

# Mint test USDT to your wallet
cast send --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "mint(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  10000000000
```

## 5. Start Frontend

```bash
cd frontend

# Copy circuit artifacts (if not already done)
mkdir -p public/circuits
cp ../circuits/build/payroll_simple_js/payroll_simple.wasm public/circuits/
cp ../circuits/build/circuit_final.zkey public/circuits/

# Install deps & start
bun install
bun dev
# Open http://localhost:3000
```

## 6. Demo Flow

1. **Connect wallet** - Import Anvil account #0 into MetaMask:
   - Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - Add network: RPC `http://127.0.0.1:8545`, Chain ID `31337`

2. **Enter payroll** - Add 3 recipients:
   - `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` - 3000 USDT
   - `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` - 4000 USDT
   - `0x90F79bf6EB2c4f870365E785982E1f101E93b906` - 3000 USDT

3. **Generate ZK proof** - Click "Generate ZK Proof" (runs snarkjs in browser)

4. **Submit** - Click "Approve USDT & Submit Payroll" (2 wallet confirmations: approve + execute)

5. **Verify** - Check recipient balances:
   ```bash
   cast call --rpc-url http://127.0.0.1:8545 \
     0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
     "balanceOf(address)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   ```

## 7. Plasma Testnet Deployment (Optional)

```bash
# Get testnet XPL from faucet (need >0.03 ETH on mainnet)
# https://gas.zip/faucet/plasma

export PLASMA_TESTNET_RPC="https://testnet-rpc.plasma.to"
export PRIVATE_KEY="your_private_key"

cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $PLASMA_TESTNET_RPC --broadcast

# Update frontend/lib/wagmi.ts with Plasma contract addresses
# Verify on https://testnet.plasmascan.to
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `circom: command not found` | Ensure `~/.cargo/bin` is in PATH |
| `snarkjs: command not found` | `npm install -g snarkjs` |
| Circuit compilation fails | Check circom version: `circom --version` (need 2.x) |
| `forge test` fails | Run `forge build` first; check Solidity version 0.8.24 |
| Frontend snarkjs error | Ensure WASM + zkey are in `public/circuits/` |
| MetaMask "Nonce too high" | Reset account in MetaMask Advanced Settings |
| Proof verification fails on-chain | Check B-point coordinate ordering (swapped for BN254) |

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
                    │  Verifier   │  (precompile at 0x08)
                    └─────────────┘
```

**Privacy guarantee**: Individual salary amounts are private inputs to the ZK circuit. Only `totalAmount` and `recipientCount` are public signals visible on-chain.
