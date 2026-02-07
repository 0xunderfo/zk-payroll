/*
 * ZK Payroll - Sum Verification Circuit
 * 
 * This circuit proves that the sum of private payment amounts equals 
 * a publicly committed total, without revealing individual amounts.
 * 
 * Public inputs:
 *   - totalAmount: The sum that we claim the amounts add up to
 *   - numPayees: Number of recipients (for contract validation)
 * 
 * Private inputs:
 *   - amounts[]: Individual payment amounts
 * 
 * Constraints:
 *   - sum(amounts) === totalAmount
 *   - each amount > 0 (prevents zero/negative payments)
 * 
 * Version: v1 (sum only)
 * TODO v2: Add Merkle root commitment
 * TODO v3: Add stealth address commitments
 */

pragma circom 2.0.0;

// Include circomlib comparators for range checks
// NOTE: This include path works with npm circomlib
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * PayrollSum - Core sum verification template
 * 
 * @param maxRecipients - Maximum number of recipients (fixed at compile time)
 *                        Actual number can be less, padded with zeros
 * 
 * NOTE: Circom requires fixed array sizes at compile time.
 *       For variable-length payrolls, pad with zeros and use activeCount.
 */
template PayrollSum(maxRecipients) {
    // ===== Public Inputs =====
    // The total amount we're claiming (will be verified on-chain)
    signal input totalAmount;
    
    // Number of actual recipients (for contract to validate)
    // This allows variable payroll sizes up to maxRecipients
    signal input activeCount;
    
    // ===== Private Inputs =====
    // Individual payment amounts (hidden from public view)
    signal input amounts[maxRecipients];
    
    // ===== Internal Signals =====
    // Running sum for accumulation
    signal runningSum[maxRecipients + 1];
    runningSum[0] <== 0;
    
    // ===== Constraints =====
    
    // 1. Accumulate the sum
    for (var i = 0; i < maxRecipients; i++) {
        runningSum[i + 1] <== runningSum[i] + amounts[i];
    }
    
    // 2. Verify total matches
    totalAmount === runningSum[maxRecipients];
    
    // 3. Verify each active amount is positive (> 0)
    // We use GreaterThan from circomlib
    // Only check up to activeCount (rest should be 0)
    component gtZero[maxRecipients];
    component isActive[maxRecipients];
    
    for (var i = 0; i < maxRecipients; i++) {
        // Check if this index is active (i < activeCount)
        isActive[i] = LessThan(8);  // 8 bits enough for up to 255 recipients
        isActive[i].in[0] <== i;
        isActive[i].in[1] <== activeCount;
        
        // For active slots: amount must be > 0
        // For inactive slots: amount must be 0
        gtZero[i] = GreaterThan(64);  // 64 bits for amounts up to ~18 quintillion
        gtZero[i].in[0] <== amounts[i];
        gtZero[i].in[1] <== 0;
        
        // Constraint: if active, must be positive; if inactive, must be zero
        // Active (isActive=1): gtZero.out must be 1
        // Inactive (isActive=0): amounts[i] must be 0
        
        // This constraint says: isActive * (gtZero - 1) === 0
        // If active (isActive=1): gtZero must be 1 (amount > 0)
        isActive[i].out * (gtZero[i].out - 1) === 0;
        
        // And: (1 - isActive) * amounts[i] === 0
        // If inactive: amount must be 0
        (1 - isActive[i].out) * amounts[i] === 0;
    }
    
    // 4. Verify activeCount is within bounds
    component countValid = LessThan(8);
    countValid.in[0] <== activeCount;
    countValid.in[1] <== maxRecipients + 1;
    countValid.out === 1;
}

/*
 * Main component
 * 
 * We set maxRecipients to 8 for the MVP.
 * This keeps the circuit small while supporting reasonable payroll sizes.
 * 
 * For larger payrolls, increase this value (but circuit size grows).
 * 
 * Public inputs are: totalAmount, activeCount
 */
component main {public [totalAmount, activeCount]} = PayrollSum(8);
