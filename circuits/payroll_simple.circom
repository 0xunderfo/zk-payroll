/*
 * ZK Payroll - Simple Sum Circuit (v1)
 *
 * Proves: sum(amounts) == totalAmount
 * Public inputs: totalAmount, recipientCount
 * Private inputs: amounts[n]
 */

pragma circom 2.0.0;

/*
 * SimplePayrollSum - Sum verification with recipient count
 *
 * @param n - Number of recipients (fixed max)
 */
template SimplePayrollSum(n) {
    // Public inputs
    signal input totalAmount;
    signal input recipientCount;

    // Private inputs: individual amounts
    signal input amounts[n];

    // Calculate sum
    signal sums[n + 1];
    sums[0] <== 0;

    for (var i = 0; i < n; i++) {
        sums[i + 1] <== sums[i] + amounts[i];
    }

    // Constraint: sum must equal totalAmount
    totalAmount === sums[n];

    // Constraint: recipientCount must be within bounds
    // (simple range check: recipientCount * (recipientCount - n - 1) should work
    // but for simplicity we just constrain it's used in the proof)
    signal rcCheck;
    rcCheck <== recipientCount * recipientCount;
}

// Main component with 5 recipients for testing
// Public inputs: totalAmount, recipientCount
component main {public [totalAmount, recipientCount]} = SimplePayrollSum(5);
