#!/usr/bin/env node
/**
 * Verify a ZK proof
 */
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");

async function main() {
  const vkey = JSON.parse(fs.readFileSync(path.join(buildDir, "verification_key.json"), "utf8"));
  const proof = JSON.parse(fs.readFileSync(path.join(buildDir, "proof.json"), "utf8"));
  const publicSignals = JSON.parse(fs.readFileSync(path.join(buildDir, "public.json"), "utf8"));

  console.log("Public signals:", publicSignals);
  console.log("Verifying...");

  const result = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (result) {
    console.log("Verification OK!");
    process.exit(0);
  } else {
    console.log("Verification FAILED!");
    process.exit(1);
  }
}

main().catch(console.error);
