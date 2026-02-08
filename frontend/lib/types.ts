/**
 * Shared types for ZK Payroll frontend
 */

export interface ClaimCredential {
  recipient: string;
  amount: string; // raw units (6 decimals)
  commitment: string;
  claimToken?: string;
  claimUrl?: string;
  nullifierHash?: string;
}
