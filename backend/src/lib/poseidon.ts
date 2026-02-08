import { buildPoseidon } from "circomlibjs";
import type { Address } from "viem";
import { randomBytes } from "crypto";

let poseidonInstance: any = null;
let field: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
    field = poseidonInstance.F;
  }
  return { poseidon: poseidonInstance, F: field };
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await getPoseidon();
  const out = poseidon(inputs);
  return F.toObject(out);
}

export function addressToField(address: Address): bigint {
  return BigInt(address.toLowerCase());
}

export function generateRandomFieldElement(): bigint {
  // 31 bytes stays comfortably below BN254 field modulus.
  const bytes = randomBytes(31);
  return BigInt(`0x${bytes.toString("hex")}`);
}

export async function computeRequestHash(
  root: bigint,
  nullifierHash: bigint,
  recipient: Address,
  relayer: Address,
  fee: bigint,
  amount: bigint
): Promise<bigint> {
  const left = await poseidonHash([root, nullifierHash, addressToField(recipient)]);
  const right = await poseidonHash([addressToField(relayer), fee, amount]);
  return poseidonHash([left, right, 1n]);
}
