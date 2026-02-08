#!/usr/bin/env node
/**
 * Generates a template input JSON for withdraw_requesthash.circom.
 * Fill with real values from backend note records before proving.
 */
const fs = require("fs");
const path = require("path");

const DEPTH = 20;

const template = {
  root: "0",
  nullifierHash: "0",
  requestHash: "0",
  amount: "0",
  secret: "0",
  nullifier: "0",
  recipient: "0",
  relayer: "0",
  fee: "0",
  pathElements: Array.from({ length: DEPTH }, () => "0"),
  pathIndices: Array.from({ length: DEPTH }, () => "0"),
};

const outPath = path.join(__dirname, "..", "input_withdraw.json");
fs.writeFileSync(outPath, JSON.stringify(template, null, 2));
console.log(`Wrote template: ${outPath}`);
