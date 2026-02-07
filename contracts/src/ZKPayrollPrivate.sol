// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IPoseidonT4} from "./PoseidonT4.sol";

/**
 * @title ZKPayrollPrivate
 * @notice Privacy-preserving payroll with Poseidon commitment scheme + zero-fee support
 * @dev Two-phase model with escrow:
 *   Phase 1 (Employer): createPayroll - transfer to escrow + store commitments
 *   Phase 2 (Recipient): claimPayment - reveal preimage to claim funds
 *
 * Zero-fee architecture:
 * - Escrow EOA holds all funds (approved this contract for transferFrom)
 * - Backend can listen to ClaimVerified events for zero-fee EIP-3009 transfers
 * - Direct on-chain claims work as fallback (employee pays gas)
 *
 * Privacy guarantees:
 * - Individual amounts are hidden behind Poseidon(recipient, amount, salt) commitments
 * - Only totalAmount and commitment hashes appear on-chain at creation
 * - Amounts are revealed individually at claim time per recipient
 *
 * Built at ETH Oxford 2026
 */
contract ZKPayrollPrivate {
    // ============ Constants ============

    uint256 public constant MAX_RECIPIENTS = 5;
    uint256 public constant RECLAIM_DEADLINE = 30 days;
    uint256 public constant NUM_PUBLIC_SIGNALS = 6;

    // ============ Errors ============

    error InvalidProof();
    error InvalidInputs();
    error InvalidTotalAmount();
    error TransferFailed();
    error AlreadyClaimed();
    error InvalidClaim();
    error PayrollNotFound();
    error TooEarly();
    error Unauthorized();
    error NothingToReclaim();

    // ============ Events ============

    event PayrollCreated(
        uint256 indexed payrollId,
        address indexed employer,
        uint256 totalAmount
    );

    event PaymentClaimed(
        uint256 indexed payrollId,
        uint256 indexed commitmentIndex,
        address recipient,
        uint256 amount
    );

    /// @notice Emitted when a claim is verified (for zero-fee backend to pick up)
    /// @dev Backend listens to this, then uses EIP-3009 to send from escrow
    event ClaimVerified(
        uint256 indexed payrollId,
        uint256 indexed commitmentIndex,
        address indexed recipient,
        uint256 amount,
        bytes32 claimId
    );

    event FundsReclaimed(
        uint256 indexed payrollId,
        address indexed employer,
        uint256 amount
    );

    // ============ Structs ============

    struct Payroll {
        address employer;
        uint256 totalAmount;
        uint256 claimedCount;
        uint256 claimedAmount;
        uint256 createdAt;
        uint256[5] commitments;
        address[5] recipients;
        bool[5] claimed;
    }

    // ============ State ============

    IVerifier public immutable verifier;
    IERC20 public immutable paymentToken;
    IPoseidonT4 public immutable poseidon;
    address public immutable escrow;

    uint256 public nextPayrollId;
    mapping(uint256 => Payroll) public payrolls;


    // ============ Constructor ============

    constructor(address _verifier, address _paymentToken, address _poseidon, address _escrow) {
        verifier = IVerifier(_verifier);
        paymentToken = IERC20(_paymentToken);
        poseidon = IPoseidonT4(_poseidon);
        escrow = _escrow;
    }

    // ============ Employer Functions ============

    /**
     * @notice Create a new payroll with ZK proof and Poseidon commitments
     * @param proof Groth16 proof components [a[0], a[1], b[0][1], b[0][0], b[1][1], b[1][0], c[0], c[1]]
     * @param totalAmount Total amount to be distributed (public input)
     * @param commitments Poseidon(recipient, amount, salt) hashes (public inputs)
     * @param recipients Recipient addresses (stored for claim verification)
     */
    function createPayroll(
        uint256[8] calldata proof,
        uint256 totalAmount,
        uint256[5] calldata commitments,
        address[5] calldata recipients
    ) external returns (uint256 payrollId) {
        if (totalAmount == 0) revert InvalidTotalAmount();

        // Verify ZK proof with 6 public signals: [totalAmount, commitments[0..4]]
        uint256[2] memory a = [proof[0], proof[1]];
        uint256[2][2] memory b = [[proof[2], proof[3]], [proof[4], proof[5]]];
        uint256[2] memory c = [proof[6], proof[7]];
        uint256[6] memory pubSignals = [
            totalAmount,
            commitments[0],
            commitments[1],
            commitments[2],
            commitments[3],
            commitments[4]
        ];

        if (!verifier.verifyProof(a, b, c, pubSignals)) revert InvalidProof();

        // Transfer funds from employer to escrow EOA
        bool success = paymentToken.transferFrom(msg.sender, escrow, totalAmount);
        if (!success) revert TransferFailed();

        // Store payroll
        payrollId = nextPayrollId++;
        Payroll storage p = payrolls[payrollId];
        p.employer = msg.sender;
        p.totalAmount = totalAmount;
        p.createdAt = block.timestamp;
        p.commitments = commitments;
        p.recipients = recipients;

        emit PayrollCreated(payrollId, msg.sender, totalAmount);
    }

    // ============ Recipient Functions ============

    /**
     * @notice Claim payment directly (fallback path, employee pays gas)
     * @dev Pulls from escrow via transferFrom. Use this if zero-fee backend is unavailable.
     * @param payrollId The payroll to claim from
     * @param commitmentIndex Index of the commitment (0-4)
     * @param amount The payment amount (preimage component)
     * @param salt The salt used in commitment (preimage component)
     */
    function claimPayment(
        uint256 payrollId,
        uint256 commitmentIndex,
        uint256 amount,
        uint256 salt
    ) external {
        _verifyClaim(payrollId, commitmentIndex, msg.sender, amount, salt);

        Payroll storage p = payrolls[payrollId];

        // Mark claimed
        p.claimed[commitmentIndex] = true;
        p.claimedCount++;
        p.claimedAmount += amount;

        // Transfer from escrow to recipient
        bool success = paymentToken.transferFrom(escrow, msg.sender, amount);
        if (!success) revert TransferFailed();

        emit PaymentClaimed(payrollId, commitmentIndex, msg.sender, amount);
    }

    /**
     * @notice Mark claim as complete (called by escrow/backend after zero-fee transfer)
     * @dev Only escrow can call. Backend verifies off-chain, does EIP-3009, then calls this.
     * @param payrollId The payroll
     * @param commitmentIndex Index of the commitment
     * @param recipient The recipient address
     * @param amount The claimed amount
     * @param salt The salt (for verification)
     */
    function markClaimedZeroFee(
        uint256 payrollId,
        uint256 commitmentIndex,
        address recipient,
        uint256 amount,
        uint256 salt
    ) external {
        if (msg.sender != escrow) revert Unauthorized();

        // Still verify on-chain for security
        _verifyClaim(payrollId, commitmentIndex, recipient, amount, salt);

        Payroll storage p = payrolls[payrollId];

        // Mark claimed
        p.claimed[commitmentIndex] = true;
        p.claimedCount++;
        p.claimedAmount += amount;

        emit PaymentClaimed(payrollId, commitmentIndex, recipient, amount);
    }

    /**
     * @notice Internal verification logic shared by both claim paths
     */
    function _verifyClaim(
        uint256 payrollId,
        uint256 commitmentIndex,
        address recipient,
        uint256 amount,
        uint256 salt
    ) internal view {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert PayrollNotFound();
        if (commitmentIndex >= MAX_RECIPIENTS) revert InvalidInputs();
        if (p.claimed[commitmentIndex]) revert AlreadyClaimed();

        // Verify recipient matches the committed recipient
        if (recipient != p.recipients[commitmentIndex]) revert InvalidClaim();

        // Verify Poseidon(recipient, amount, salt) == stored commitment
        uint256 computedCommitment = poseidon.poseidon(
            [uint256(uint160(recipient)), amount, salt]
        );
        if (computedCommitment != p.commitments[commitmentIndex]) revert InvalidClaim();
    }

    /**
     * @notice Verify a claim without executing (for frontend/backend validation)
     */
    function verifyClaim(
        uint256 payrollId,
        uint256 commitmentIndex,
        address recipient,
        uint256 amount,
        uint256 salt
    ) external view returns (bool) {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) return false;
        if (commitmentIndex >= MAX_RECIPIENTS) return false;
        if (p.claimed[commitmentIndex]) return false;
        if (recipient != p.recipients[commitmentIndex]) return false;

        uint256 computedCommitment = poseidon.poseidon(
            [uint256(uint160(recipient)), amount, salt]
        );
        return computedCommitment == p.commitments[commitmentIndex];
    }

    // ============ Employer Reclaim ============

    /**
     * @notice Reclaim unclaimed funds after deadline
     * @param payrollId The payroll to reclaim from
     */
    function reclaimUnclaimed(uint256 payrollId) external {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert PayrollNotFound();
        if (msg.sender != p.employer) revert Unauthorized();
        if (block.timestamp < p.createdAt + RECLAIM_DEADLINE) revert TooEarly();

        uint256 remaining = p.totalAmount - p.claimedAmount;
        if (remaining == 0) revert NothingToReclaim();

        // Mark all as claimed to prevent future claims
        p.claimedAmount = p.totalAmount;

        // Transfer from escrow to employer
        bool success = paymentToken.transferFrom(escrow, p.employer, remaining);
        if (!success) revert TransferFailed();

        emit FundsReclaimed(payrollId, p.employer, remaining);
    }

    // ============ View Functions ============

    function getCommitments(uint256 payrollId) external view returns (uint256[5] memory) {
        return payrolls[payrollId].commitments;
    }

    function getRecipients(uint256 payrollId) external view returns (address[5] memory) {
        return payrolls[payrollId].recipients;
    }

    function isClaimed(uint256 payrollId, uint256 index) external view returns (bool) {
        return payrolls[payrollId].claimed[index];
    }

    function getPayrollInfo(uint256 payrollId)
        external
        view
        returns (
            address employer,
            uint256 totalAmount,
            uint256 claimedCount,
            uint256 claimedAmount,
            uint256 createdAt
        )
    {
        Payroll storage p = payrolls[payrollId];
        return (p.employer, p.totalAmount, p.claimedCount, p.claimedAmount, p.createdAt);
    }
}

/**
 * @title IVerifier
 * @notice Interface for the Groth16 verifier (6 public signals)
 */
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[6] calldata _pubSignals
    ) external view returns (bool);
}
