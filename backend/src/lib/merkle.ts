import { poseidonHash } from "./poseidon";

export interface MerkleProof {
  pathElements: bigint[];
  pathIndices: number[];
}

async function computeZeroHashes(depth: number): Promise<bigint[]> {
  const zeros: bigint[] = new Array(depth + 1).fill(0n);
  for (let i = 1; i <= depth; i++) {
    zeros[i] = await poseidonHash([zeros[i - 1], zeros[i - 1]]);
  }
  return zeros;
}

async function buildNextLevel(nodes: bigint[], levelZero: bigint): Promise<bigint[]> {
  const parents: bigint[] = [];
  if (nodes.length === 0) {
    return [await poseidonHash([levelZero, levelZero])];
  }

  for (let i = 0; i < nodes.length; i += 2) {
    const left = nodes[i] ?? levelZero;
    const right = nodes[i + 1] ?? levelZero;
    parents.push(await poseidonHash([left, right]));
  }
  return parents;
}

export async function computeMerkleRoot(
  leaves: bigint[],
  depth: number
): Promise<bigint> {
  const zeroHashes = await computeZeroHashes(depth);
  let levelNodes = leaves.length ? [...leaves] : [0n];

  for (let level = 0; level < depth; level++) {
    levelNodes = await buildNextLevel(levelNodes, zeroHashes[level]);
  }

  return levelNodes[0] ?? zeroHashes[depth];
}

export async function computeMerkleProof(
  leaves: bigint[],
  depth: number,
  leafIndex: number
): Promise<MerkleProof> {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("Leaf index out of range");
  }

  const zeroHashes = await computeZeroHashes(depth);
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  let idx = leafIndex;
  let levelNodes = [...leaves];

  for (let level = 0; level < depth; level++) {
    const siblingIndex = idx ^ 1;
    const sibling = levelNodes[siblingIndex] ?? zeroHashes[level];

    pathElements.push(sibling);
    pathIndices.push(idx & 1);

    levelNodes = await buildNextLevel(levelNodes, zeroHashes[level]);
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices };
}
