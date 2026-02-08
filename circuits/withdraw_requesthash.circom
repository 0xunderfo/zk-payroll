pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template WithdrawRequestHash(depth) {
    // Public inputs
    signal input root;
    signal input nullifierHash;
    signal input requestHash;

    // Private note data
    signal input amount;
    signal input secret;
    signal input nullifier;

    // Private payout data
    signal input recipient;
    signal input relayer;
    signal input fee;

    // Private Merkle auth path
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // noteCommitment = Poseidon(amount, secret, nullifier)
    component noteHasher = Poseidon(3);
    noteHasher.inputs[0] <== amount;
    noteHasher.inputs[1] <== secret;
    noteHasher.inputs[2] <== nullifier;

    // nullifierHash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.out === nullifierHash;

    // fee <= amount
    component feeLeqAmount = LessEqThan(252);
    feeLeqAmount.in[0] <== fee;
    feeLeqAmount.in[1] <== amount;
    feeLeqAmount.out === 1;

    // Merkle inclusion proof with Poseidon binary hashing
    signal levelNode[depth + 1];
    levelNode[0] <== noteHasher.out;

    component merkleHashers[depth];
    signal leftNode[depth];
    signal rightNode[depth];
    signal leftPartA[depth];
    signal leftPartB[depth];
    signal rightPartA[depth];
    signal rightPartB[depth];
    signal oneMinusIndex[depth];

    for (var i = 0; i < depth; i++) {
        // path index must be boolean
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        oneMinusIndex[i] <== 1 - pathIndices[i];

        leftPartA[i] <== oneMinusIndex[i] * levelNode[i];
        leftPartB[i] <== pathIndices[i] * pathElements[i];
        leftNode[i] <== leftPartA[i] + leftPartB[i];

        rightPartA[i] <== pathIndices[i] * levelNode[i];
        rightPartB[i] <== oneMinusIndex[i] * pathElements[i];
        rightNode[i] <== rightPartA[i] + rightPartB[i];

        merkleHashers[i] = Poseidon(2);
        merkleHashers[i].inputs[0] <== leftNode[i];
        merkleHashers[i].inputs[1] <== rightNode[i];
        levelNode[i + 1] <== merkleHashers[i].out;
    }

    levelNode[depth] === root;

    // requestHash = Poseidon(Poseidon(root, nullifierHash, recipient), Poseidon(relayer, fee, amount), 1)
    component leftRequestHasher = Poseidon(3);
    leftRequestHasher.inputs[0] <== root;
    leftRequestHasher.inputs[1] <== nullifierHash;
    leftRequestHasher.inputs[2] <== recipient;

    component rightRequestHasher = Poseidon(3);
    rightRequestHasher.inputs[0] <== relayer;
    rightRequestHasher.inputs[1] <== fee;
    rightRequestHasher.inputs[2] <== amount;

    component requestHasher = Poseidon(3);
    requestHasher.inputs[0] <== leftRequestHasher.out;
    requestHasher.inputs[1] <== rightRequestHasher.out;
    requestHasher.inputs[2] <== 1;
    requestHasher.out === requestHash;
}

component main {public [root, nullifierHash, requestHash]} = WithdrawRequestHash(20);
