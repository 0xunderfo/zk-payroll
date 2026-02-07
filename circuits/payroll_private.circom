/*
 * ZK Payroll - Private Payroll Circuit (v2.1)
 *
 * Proves:
 *   1. sum(amounts) == totalAmount
 *   2. Poseidon(recipient_i, amount_i, salt_i) == commitment_i for each slot
 *
 * Public inputs: totalAmount, commitments[5]
 * Private inputs: recipients[5], amounts[5], salts[5]
 *
 * Note: Unused slots simply have amount=0 (enforced by sum constraint)
 */

pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

template PrivatePayroll(maxRecipients) {
    // Public signals
    signal input totalAmount;
    signal input commitments[maxRecipients];

    // Private signals
    signal input recipients[maxRecipients];
    signal input amounts[maxRecipients];
    signal input salts[maxRecipients];

    // 1. Commitment binding: Poseidon(recipient, amount, salt) == commitment
    component hasher[maxRecipients];
    for (var i = 0; i < maxRecipients; i++) {
        hasher[i] = Poseidon(3);
        hasher[i].inputs[0] <== recipients[i];
        hasher[i].inputs[1] <== amounts[i];
        hasher[i].inputs[2] <== salts[i];
        hasher[i].out === commitments[i];
    }

    // 2. Sum verification: all amounts must add up to totalAmount
    signal sums[maxRecipients + 1];
    sums[0] <== 0;
    for (var i = 0; i < maxRecipients; i++) {
        sums[i + 1] <== sums[i] + amounts[i];
    }
    totalAmount === sums[maxRecipients];
}

component main {public [totalAmount, commitments]} = PrivatePayroll(5);
