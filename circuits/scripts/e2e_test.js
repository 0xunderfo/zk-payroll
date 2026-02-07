#!/usr/bin/env node
/**
 * E2E test: Generate proof, createPayroll on Anvil, claimPayment
 */
const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");
const { execSync } = require("child_process");
const path = require("path");

const RPC = "http://127.0.0.1:8545";
const PAYROLL = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";
const USDT = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6";

const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ACCT1_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ACCT2_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

function cast(cmd) {
  return execSync(`cast ${cmd} --rpc-url ${RPC}`, { encoding: "utf8" }).trim();
}

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const recipients = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
  ];
  const amounts = ["5000000000", "5000000000", "0", "0", "0"];
  const salts = ["123456789", "987654321", "0", "0", "0"];
  const totalAmount = "10000000000";

  const recipientValues = recipients.map((r) => BigInt(r).toString());
  const commitments = [];
  for (let i = 0; i < 5; i++) {
    const hash = poseidon([
      BigInt(recipientValues[i]),
      BigInt(amounts[i]),
      BigInt(salts[i]),
    ]);
    commitments.push(F.toObject(hash).toString());
  }

  const circuitsDir = path.join(__dirname, "..");

  // v2.1: no activeCount in circuit input
  const input = {
    totalAmount,
    commitments,
    recipients: recipientValues,
    amounts,
    salts,
  };

  console.log("1. Generating proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(circuitsDir, "build/payroll_private_js/payroll_private.wasm"),
    path.join(circuitsDir, "build/circuit_final.zkey")
  );
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );
  console.log("   Proof generated!");

  // Parse calldata
  const [a, b, c, pub] = JSON.parse("[" + calldata + "]");
  const proof8 =
    "[" +
    [a[0], a[1], b[0][0], b[0][1], b[1][0], b[1][1], c[0], c[1]].join(",") +
    "]";

  console.log("2. Approve USDT...");
  cast(
    `send ${USDT} "approve(address,uint256)" ${PAYROLL} ${totalAmount} --private-key ${DEPLOYER_KEY}`
  );
  console.log("   Approved!");

  console.log("3. createPayroll...");
  const commitStr = "[" + commitments.join(",") + "]";
  const recipStr = "[" + recipients.join(",") + "]";

  // v2.1: no activeCount parameter
  cast(
    `send ${PAYROLL} "createPayroll(uint256[8],uint256,uint256[5],address[5])" "${proof8}" ${totalAmount} "${commitStr}" "${recipStr}" --private-key ${DEPLOYER_KEY}`
  );
  console.log("   Payroll created!");

  const payrollBal = cast(
    `call ${USDT} "balanceOf(address)" ${PAYROLL}`
  );
  console.log(
    "   Contract balance:",
    parseInt(payrollBal, 16) / 1e6,
    "USDT"
  );

  console.log("4. Claim as recipient 0 (0x7099...)...");
  cast(
    `send ${PAYROLL} "claimPayment(uint256,uint256,uint256,uint256)" 0 0 5000000000 123456789 --private-key ${ACCT1_KEY}`
  );

  const aliceBal = cast(
    `call ${USDT} "balanceOf(address)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
  );
  console.log("   Alice balance:", parseInt(aliceBal, 16) / 1e6, "USDT");

  console.log("5. Claim as recipient 1 (0x3C44...)...");
  cast(
    `send ${PAYROLL} "claimPayment(uint256,uint256,uint256,uint256)" 0 1 5000000000 987654321 --private-key ${ACCT2_KEY}`
  );

  const bobBal = cast(
    `call ${USDT} "balanceOf(address)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
  );
  console.log("   Bob balance:", parseInt(bobBal, 16) / 1e6, "USDT");

  const contractFinal = cast(
    `call ${USDT} "balanceOf(address)" ${PAYROLL}`
  );

  console.log("");
  console.log("=== E2E RESULT ===");
  console.log("Alice:", parseInt(aliceBal, 16) / 1e6, "USDT");
  console.log("Bob:", parseInt(bobBal, 16) / 1e6, "USDT");
  console.log(
    "Contract remaining:",
    parseInt(contractFinal, 16) / 1e6,
    "USDT"
  );
  console.log("SUCCESS!");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
