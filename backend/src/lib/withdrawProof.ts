import * as snarkjs from "snarkjs";
import { existsSync } from "fs";
import { join } from "path";

const WITHDRAW_WASM_PATH = join(process.cwd(), "circuits/withdraw_requesthash.wasm");
const WITHDRAW_ZKEY_PATH = join(process.cwd(), "circuits/withdraw_final.zkey");

export interface WithdrawProofInput {
  root: string;
  nullifierHash: string;
  requestHash: string;
  amount: string;
  secret: string;
  nullifier: string;
  recipient: string;
  relayer: string;
  fee: string;
  pathElements: string[];
  pathIndices: string[];
}

export function ensureWithdrawArtifacts() {
  if (!existsSync(WITHDRAW_WASM_PATH) || !existsSync(WITHDRAW_ZKEY_PATH)) {
    throw new Error(
      "Missing withdraw circuit artifacts. Expected backend/circuits/withdraw_requesthash.wasm and backend/circuits/withdraw_final.zkey"
    );
  }
}

export async function generateWithdrawProof(input: WithdrawProofInput): Promise<{
  proof: bigint[];
  publicSignals: string[];
}> {
  ensureWithdrawArtifacts();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WITHDRAW_WASM_PATH,
    WITHDRAW_ZKEY_PATH
  );

  const solidityProof: bigint[] = [
    BigInt(proof.pi_a[0]),
    BigInt(proof.pi_a[1]),
    BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[0][0]),
    BigInt(proof.pi_b[1][1]),
    BigInt(proof.pi_b[1][0]),
    BigInt(proof.pi_c[0]),
    BigInt(proof.pi_c[1]),
  ];

  return {
    proof: solidityProof,
    publicSignals: publicSignals.map((s: string) => s.toString()),
  };
}
