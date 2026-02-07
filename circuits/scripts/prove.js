#!/usr/bin/env node
/**
 * Generate a ZK proof from input.json
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");

async function main() {
  const inputFile = process.argv[2] || path.join(__dirname, "..", "input.json");
  const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));

  console.log("Generating proof for:", input);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(buildDir, "payroll_simple_js", "payroll_simple.wasm"),
    path.join(buildDir, "circuit_final.zkey")
  );

  console.log("\nPublic signals:", publicSignals);
  console.log("\nProof:", JSON.stringify(proof, null, 2));

  fs.writeFileSync(path.join(buildDir, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(buildDir, "public.json"), JSON.stringify(publicSignals, null, 2));

  // Generate Solidity calldata
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  console.log("\nSolidity calldata:", calldata);

  console.log("\nProof written to build/proof.json");
  console.log("Public signals written to build/public.json");
}

main().catch(console.error);
