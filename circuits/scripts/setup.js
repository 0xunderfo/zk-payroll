#!/usr/bin/env node
/**
 * Automated circuit setup ceremony
 * Compiles circuit, runs Groth16 setup, generates verifier
 */
const { execSync } = require("child_process");
const path = require("path");

const circuitsDir = path.join(__dirname, "..");
const buildDir = path.join(circuitsDir, "build");

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: circuitsDir, ...opts });
}

async function main() {
  console.log("=== ZK Payroll v2 Circuit Setup ===\n");

  // 1. Compile circuit
  console.log("1. Compiling payroll_private circuit...");
  run(`circom payroll_private.circom --r1cs --wasm --sym -o build/`);

  // 2. Show circuit info
  console.log("\n2. Circuit info:");
  run(`snarkjs r1cs info build/payroll_private.r1cs`);

  // 3. Groth16 setup (using ptau_12 for Poseidon circuits)
  console.log("\n3. Running Groth16 setup...");
  run(`snarkjs groth16 setup build/payroll_private.r1cs build/powersOfTau28_hez_final_12.ptau build/circuit_0000.zkey`);

  // 4. Contribute to ceremony
  console.log("\n4. Contributing to ceremony...");
  run(`snarkjs zkey contribute build/circuit_0000.zkey build/circuit_final.zkey --name="ZK Payroll v2" -e="zk payroll v2 hackathon entropy"`);

  // 5. Export verification key
  console.log("\n5. Exporting verification key...");
  run(`snarkjs zkey export verificationkey build/circuit_final.zkey build/verification_key.json`);

  // 6. Export Solidity verifier
  console.log("\n6. Generating Verifier.sol...");
  run(`snarkjs zkey export solidityverifier build/circuit_final.zkey ../contracts/src/Verifier.sol`);

  // 7. Copy artifacts for frontend
  console.log("\n7. Copying artifacts for frontend...");
  run(`mkdir -p ../frontend/public/circuits`);
  run(`cp build/payroll_private_js/payroll_private.wasm ../frontend/public/circuits/`);
  run(`cp build/circuit_final.zkey ../frontend/public/circuits/`);

  console.log("\n=== Setup Complete ===");
  console.log("Verifier.sol generated at: contracts/src/Verifier.sol");
  console.log("Frontend artifacts at: frontend/public/circuits/");
}

main().catch(console.error);
