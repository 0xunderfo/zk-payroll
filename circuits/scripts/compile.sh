#!/bin/bash
# Compile the circuit and generate proving/verification keys
# Run from circuits directory: ./scripts/compile.sh

set -e

echo "=== ZK Payroll Circuit Compilation ==="
echo ""

# Check if circom is available
if ! command -v circom &> /dev/null; then
    echo "Error: circom not found. Install it first."
    exit 1
fi

# Create build directory
mkdir -p build

# Use the simple circuit for initial testing
CIRCUIT="payroll_simple"

echo "1. Compiling circuit: ${CIRCUIT}.circom"
circom ${CIRCUIT}.circom --r1cs --wasm --sym -o build/

echo ""
echo "2. Displaying circuit info"
snarkjs r1cs info build/${CIRCUIT}.r1cs

echo ""
echo "3. Setting up Groth16 (using existing powers of tau)"
snarkjs groth16 setup build/${CIRCUIT}.r1cs build/powersOfTau28_hez_final_10.ptau build/circuit_0000.zkey

echo ""
echo "4. Contributing to ceremony (test contribution)"
# Non-interactive contribution with random entropy
echo "test-contribution-entropy" | snarkjs zkey contribute build/circuit_0000.zkey build/circuit_final.zkey --name="Test Contributor" -v

echo ""
echo "5. Exporting verification key"
snarkjs zkey export verificationkey build/circuit_final.zkey build/verification_key.json

echo ""
echo "6. Exporting Solidity verifier"
snarkjs zkey export solidityverifier build/circuit_final.zkey ../contracts/src/Verifier.sol

echo ""
echo "=== Compilation Complete ==="
echo ""
echo "Generated files in build/:"
ls -la build/
echo ""
echo "Next steps:"
echo "  1. Test with: snarkjs groth16 fullprove input.json build/${CIRCUIT}_js/${CIRCUIT}.wasm build/circuit_final.zkey proof.json public.json"
echo "  2. Verify with: snarkjs groth16 verify build/verification_key.json public.json proof.json"
