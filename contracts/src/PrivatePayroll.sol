// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IPoseidonT4} from "./PoseidonT4.sol";

/**
 * @title PrivatePayroll
 * @notice Global note pool for payroll funding with zero-fee USDT0 settlement support
 * @dev
 *  - Escrow EOA receives employer funds via EIP-3009 (off-chain relayer flow)
 *  - Contract stores privacy state only: roots + nullifiers + reservation state
 *  - Escrow reserves and finalizes withdrawals after relayer confirmation
 *  - Direct on-chain withdraw remains as fallback if backend is unavailable
 */
contract PrivatePayroll {
    // ============ Errors ============

    error Unauthorized();
    error InvalidInputs();
    error InvalidProof();
    error TransferFailed();
    error UnknownRoot();
    error RootAlreadyKnown();
    error BatchAlreadyProcessed();
    error FeeTooHigh();
    error NullifierAlreadyUsed();
    error NullifierAlreadyReserved();
    error ReservationNotFound();
    error AuthorizationMismatch();
    error InvalidRequestHash();

    // ============ Events ============

    /// @notice Emitted when a new note tree root is accepted by the pool.
    event RootRegistered(
        uint256 indexed root,
        bytes32 indexed batchId,
        uint256 noteCount,
        uint256 totalAmount
    );

    /// @notice Emitted when a zero-fee withdrawal is reserved before EIP-3009 settlement.
    event WithdrawalReserved(
        uint256 indexed nullifierHash,
        uint256 indexed root,
        uint256 indexed requestHash,
        bytes32 authorizationId
    );

    /// @notice Emitted once escrow confirms EIP-3009 settlement and consumes nullifier.
    event WithdrawalFinalized(
        uint256 indexed nullifierHash,
        uint256 indexed requestHash,
        bytes32 authorizationId
    );

    /// @notice Emitted when a pending reservation is canceled.
    event WithdrawalCanceled(
        uint256 indexed nullifierHash,
        bytes32 indexed authorizationId,
        bytes32 reasonHash
    );

    /// @notice Emitted when user performs fallback direct withdrawal through contract transferFrom.
    event DirectWithdrawal(uint256 indexed nullifierHash, address indexed recipient, uint256 amount);

    // ============ Structs ============

    struct PendingWithdrawal {
        uint256 requestHash;
        bytes32 authorizationId;
        uint64 createdAt;
        bool exists;
    }

    // ============ State ============

    IVerifier public immutable verifier;
    IERC20 public immutable paymentToken;
    IPoseidonT4 public immutable poseidon;
    address public immutable escrow;

    uint256 public latestRoot;
    uint256 public rootCount;
    uint256 private constant REQUEST_HASH_DOMAIN = 1;

    mapping(uint256 => bool) public knownRoots;
    mapping(bytes32 => bool) public processedBatchIds;
    mapping(uint256 => bool) public nullifierSpent;
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;

    // ============ Constructor ============

    constructor(address _verifier, address _paymentToken, address _poseidon, address _escrow) {
        if (
            _verifier == address(0) ||
            _paymentToken == address(0) ||
            _poseidon == address(0) ||
            _escrow == address(0)
        ) {
            revert InvalidInputs();
        }
        verifier = IVerifier(_verifier);
        paymentToken = IERC20(_paymentToken);
        poseidon = IPoseidonT4(_poseidon);
        escrow = _escrow;
    }

    // ============ Modifiers ============

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert Unauthorized();
        _;
    }

    // ============ Root Registration ============

    /**
     * @notice Register a new Merkle root for notes already funded into escrow via EIP-3009.
     * @dev Called by escrow/backend after relayer confirms employer transfer.
     */
    function registerRoot(
        uint256 root,
        bytes32 batchId,
        uint256 noteCount,
        uint256 totalAmount
    ) external onlyEscrow {
        _registerRoot(root, batchId, noteCount, totalAmount);
    }

    /**
     * @notice Convenience path for direct funding without EIP-3009.
     * @dev Transfers paymentToken from sender into escrow and then registers root.
     */
    function depositAndRegisterRoot(
        uint256 root,
        bytes32 batchId,
        uint256 noteCount,
        uint256 totalAmount
    ) external {
        if (totalAmount == 0) revert InvalidInputs();
        bool success = paymentToken.transferFrom(msg.sender, escrow, totalAmount);
        if (!success) revert TransferFailed();
        _registerRoot(root, batchId, noteCount, totalAmount);
    }

    function _registerRoot(
        uint256 root,
        bytes32 batchId,
        uint256 noteCount,
        uint256 totalAmount
    ) internal {
        if (root == 0 || batchId == bytes32(0) || noteCount == 0) revert InvalidInputs();
        if (knownRoots[root]) revert RootAlreadyKnown();
        if (processedBatchIds[batchId]) revert BatchAlreadyProcessed();

        knownRoots[root] = true;
        processedBatchIds[batchId] = true;
        latestRoot = root;
        rootCount++;

        emit RootRegistered(root, batchId, noteCount, totalAmount);
    }

    // ============ Zero-Fee Settlement ============

    /**
     * @notice Reserve a withdrawal before escrow submits EIP-3009 transfer.
     * @dev Proof public inputs are [root, nullifierHash, requestHash].
     */
    function reserveZeroFeeWithdrawal(
        uint256[8] calldata proof,
        uint256 root,
        uint256 nullifierHash,
        uint256 requestHash,
        bytes32 authorizationId
    ) external onlyEscrow {
        if (requestHash == 0 || authorizationId == bytes32(0)) {
            revert InvalidInputs();
        }
        if (!knownRoots[root]) revert UnknownRoot();
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadyUsed();
        if (pendingWithdrawals[nullifierHash].exists) revert NullifierAlreadyReserved();
        bool proofOk = _verifyWithdrawalProof(proof, root, nullifierHash, requestHash);
        if (!proofOk) revert InvalidProof();

        pendingWithdrawals[nullifierHash] = PendingWithdrawal({
            requestHash: requestHash,
            authorizationId: authorizationId,
            createdAt: uint64(block.timestamp),
            exists: true
        });

        emit WithdrawalReserved(nullifierHash, root, requestHash, authorizationId);
    }

    /**
     * @notice Finalize a reserved withdrawal after relayer confirms EIP-3009 transfer.
     * @dev Consumes nullifier so note cannot be withdrawn again.
     */
    function finalizeZeroFeeWithdrawal(
        uint256 nullifierHash,
        bytes32 authorizationId
    ) external onlyEscrow {
        PendingWithdrawal memory pending = pendingWithdrawals[nullifierHash];
        if (!pending.exists) revert ReservationNotFound();
        if (pending.authorizationId != authorizationId) revert AuthorizationMismatch();

        nullifierSpent[nullifierHash] = true;
        delete pendingWithdrawals[nullifierHash];

        emit WithdrawalFinalized(nullifierHash, pending.requestHash, authorizationId);
    }

    /**
     * @notice Cancel a reserved withdrawal if settlement fails or expires.
     * @dev Does not consume nullifier; withdrawal can be retried with a new authorization.
     */
    function cancelReservedWithdrawal(
        uint256 nullifierHash,
        bytes32 authorizationId,
        bytes32 reasonHash
    ) external onlyEscrow {
        PendingWithdrawal memory pending = pendingWithdrawals[nullifierHash];
        if (!pending.exists) revert ReservationNotFound();
        if (pending.authorizationId != authorizationId) revert AuthorizationMismatch();

        delete pendingWithdrawals[nullifierHash];
        emit WithdrawalCanceled(nullifierHash, authorizationId, reasonHash);
    }

    // ============ Direct Fallback ============

    /**
     * @notice Fallback path: recipient withdraws directly and pays gas.
     * @dev Uses same proof format and derives request hash from msg.sender + amount.
     */
    function directWithdraw(
        uint256[8] calldata proof,
        uint256 root,
        uint256 nullifierHash,
        uint256 amount
    ) external {
        if (amount == 0) revert InvalidInputs();
        if (!knownRoots[root]) revert UnknownRoot();
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadyUsed();
        if (pendingWithdrawals[nullifierHash].exists) revert NullifierAlreadyReserved();

        uint256 requestHash = _computeRequestHash(
            root,
            nullifierHash,
            msg.sender,
            address(0),
            0,
            amount
        );
        if (requestHash == 0) revert InvalidRequestHash();

        bool proofOk = _verifyWithdrawalProof(proof, root, nullifierHash, requestHash);
        if (!proofOk) revert InvalidProof();

        nullifierSpent[nullifierHash] = true;

        bool success = paymentToken.transferFrom(escrow, msg.sender, amount);
        if (!success) revert TransferFailed();

        emit DirectWithdrawal(nullifierHash, msg.sender, amount);
    }

    // ============ View Helpers ============

    function verifyWithdrawal(
        uint256[8] calldata proof,
        uint256 root,
        uint256 nullifierHash,
        uint256 requestHash
    ) external view returns (bool) {
        if (requestHash == 0) return false;
        if (!knownRoots[root]) return false;
        if (nullifierSpent[nullifierHash]) return false;
        if (pendingWithdrawals[nullifierHash].exists) return false;
        return _verifyWithdrawalProof(proof, root, nullifierHash, requestHash);
    }

    function getPendingWithdrawal(
        uint256 nullifierHash
    )
        external
        view
        returns (
            uint256 requestHash,
            bytes32 authorizationId,
            uint64 createdAt,
            bool exists
        )
    {
        PendingWithdrawal memory pending = pendingWithdrawals[nullifierHash];
        return (
            pending.requestHash,
            pending.authorizationId,
            pending.createdAt,
            pending.exists
        );
    }

    function computeRequestHash(
        uint256 root,
        uint256 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee,
        uint256 amount
    ) external view returns (uint256) {
        return _computeRequestHash(root, nullifierHash, recipient, relayer, fee, amount);
    }

    // ============ Internal ============

    function _verifyWithdrawalProof(
        uint256[8] calldata proof,
        uint256 root,
        uint256 nullifierHash,
        uint256 requestHash
    ) internal view returns (bool) {
        uint256[2] memory a = [proof[0], proof[1]];
        uint256[2][2] memory b = [[proof[2], proof[3]], [proof[4], proof[5]]];
        uint256[2] memory c = [proof[6], proof[7]];

        uint256[3] memory pubSignals = [
            root,
            nullifierHash,
            requestHash
        ];
        return verifier.verifyProof(a, b, c, pubSignals);
    }

    function _computeRequestHash(
        uint256 root,
        uint256 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee,
        uint256 amount
    ) internal view returns (uint256) {
        uint256 left = poseidon.poseidon([
            root,
            nullifierHash,
            uint256(uint160(recipient))
        ]);
        uint256 right = poseidon.poseidon([
            uint256(uint160(relayer)),
            fee,
            amount
        ]);
        return poseidon.poseidon([left, right, REQUEST_HASH_DOMAIN]);
    }
}

/**
 * @title IVerifier
 * @notice Groth16 verifier interface with 3 public signals.
 * @dev Public signals: [root, nullifierHash, requestHash].
 */
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[3] calldata _pubSignals
    ) external view returns (bool);
}
