#!/usr/bin/env node
/**
 * Generate test input for payroll_private circuit
 * Computes Poseidon commitments using circomlibjs
 */
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Test data: 3 active recipients, 2 inactive (zero-padded)
  const recipients = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
  ];

  const amounts = [
    3000000000, // 3000 USDT (6 decimals)
    4000000000, // 4000 USDT
    3000000000, // 3000 USDT
    0,
    0,
  ];

  const totalAmount = amounts.reduce((a, b) => a + b, 0); // 10000 USDT
  const activeCount = 3; // Used for salt generation, not in circuit

  // Generate random salts for active recipients, 0 for inactive
  const salts = [];
  for (let i = 0; i < 5; i++) {
    if (i < activeCount) {
      // Random 31-byte value (to stay within BN254 field)
      const buf = crypto.randomBytes(31);
      salts.push(BigInt("0x" + buf.toString("hex")).toString());
    } else {
      salts.push("0");
    }
  }

  // Convert addresses to BigInt (field elements)
  const recipientValues = recipients.map((addr) => BigInt(addr).toString());

  // Compute Poseidon commitments: Poseidon(recipient, amount, salt)
  const commitments = [];
  for (let i = 0; i < 5; i++) {
    const hash = poseidon([
      BigInt(recipientValues[i]),
      BigInt(amounts[i]),
      BigInt(salts[i]),
    ]);
    commitments.push(F.toObject(hash).toString());
  }

  // v2.1: no activeCount in circuit input
  const input = {
    totalAmount: totalAmount.toString(),
    commitments: commitments,
    recipients: recipientValues,
    amounts: amounts.map(String),
    salts: salts,
  };

  const outputPath = path.join(__dirname, "..", "input_private.json");
  fs.writeFileSync(outputPath, JSON.stringify(input, null, 2));
  console.log("Test input written to:", outputPath);
  console.log("\nPublic signals (6):");
  console.log("  totalAmount:", input.totalAmount);
  console.log("  commitments:", input.commitments);

  // Also output claim credentials for testing
  console.log("\nClaim credentials (for testing):");
  for (let i = 0; i < activeCount; i++) {
    console.log(`  Recipient ${i}: ${recipients[i]}`);
    console.log(`    amount: ${amounts[i]}`);
    console.log(`    salt: ${salts[i]}`);
    console.log(`    commitment: ${commitments[i]}`);
  }
}

main().catch(console.error);
