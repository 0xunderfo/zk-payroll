#!/usr/bin/env node
/**
 * Withdrawal circuit setup ceremony (requestHash-only public signals).
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const circuitsDir = path.join(__dirname, "..");
const buildDir = path.join(circuitsDir, "build");
const PTAU_POWER = 15;
const ptauPath = path.join(buildDir, `powersOfTau28_hez_final_${PTAU_POWER}.ptau`);

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: circuitsDir });
}

async function main() {
  console.log("=== Withdraw Circuit Setup (Pool V1) ===\n");

  run("mkdir -p build");

  if (!fs.existsSync(ptauPath)) {
    console.log(`0. powersOfTau .ptau missing, generating local ptau (${PTAU_POWER})...`);
    run(`snarkjs powersoftau new bn128 ${PTAU_POWER} build/pot${PTAU_POWER}_0000.ptau -v`);
    run(
      `snarkjs powersoftau contribute build/pot${PTAU_POWER}_0000.ptau build/pot${PTAU_POWER}_0001.ptau --name="Private Payroll Local PTAU" -e="private-payroll-local-ptau-entropy"`
    );
    run(
      `snarkjs powersoftau prepare phase2 build/pot${PTAU_POWER}_0001.ptau build/powersOfTau28_hez_final_${PTAU_POWER}.ptau`
    );
  } else {
    console.log(`0. Reusing existing build/powersOfTau28_hez_final_${PTAU_POWER}.ptau`);
  }

  console.log("1. Compile withdraw_requesthash.circom");
  run("circom withdraw_requesthash.circom --r1cs --wasm --sym -o build/");

  console.log("\n2. Show circuit info");
  run("snarkjs r1cs info build/withdraw_requesthash.r1cs");

  console.log("\n3. Groth16 setup");
  run(`snarkjs groth16 setup build/withdraw_requesthash.r1cs build/powersOfTau28_hez_final_${PTAU_POWER}.ptau build/withdraw_0000.zkey`);

  console.log("\n4. Contribute entropy");
  run('snarkjs zkey contribute build/withdraw_0000.zkey build/withdraw_final.zkey --name="Private Payroll Withdraw V1" -e="withdraw-v1-entropy"');

  console.log("\n5. Export verification key");
  run("snarkjs zkey export verificationkey build/withdraw_final.zkey build/withdraw_verification_key.json");

  console.log("\n6. Export Solidity verifier");
  run("snarkjs zkey export solidityverifier build/withdraw_final.zkey ../contracts/src/WithdrawVerifier.sol");

  console.log("\n7. Copy artifacts to backend");
  run("mkdir -p ../backend/circuits");
  run("cp build/withdraw_requesthash_js/withdraw_requesthash.wasm ../backend/circuits/withdraw_requesthash.wasm");
  run("cp build/withdraw_final.zkey ../backend/circuits/withdraw_final.zkey");

  console.log("\n=== Done ===");
  console.log("Verifier: contracts/src/WithdrawVerifier.sol");
  console.log("Backend artifacts: backend/circuits/withdraw_requesthash.wasm + withdraw_final.zkey");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
