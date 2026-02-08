// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrivatePayroll} from "../src/PrivatePayroll.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

contract MockUSDT is IERC20 {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract MockVerifier3 {
    bool public shouldVerify = true;

    function setShouldVerify(bool value) external {
        shouldVerify = value;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[3] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}

contract MockPoseidonT4 {
    function poseidon(uint256[3] memory input) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(input[0], input[1], input[2])));
    }
}

contract PrivatePayrollTest is Test {
    PrivatePayroll public payroll;
    MockUSDT public usdt;
    MockVerifier3 public verifier;
    MockPoseidonT4 public poseidon;

    address public employer = address(0x1);
    address public recipient = address(0x2);
    address public recipientTwo = address(0x3);
    address public relayer = address(0x4);
    address public escrow = address(0x5);

    uint256 constant ROOT_A = 1_111;
    uint256 constant ROOT_B = 2_222;
    bytes32 constant BATCH_A = keccak256("batch-a");
    bytes32 constant BATCH_B = keccak256("batch-b");
    uint256 constant AMOUNT = 3_000e6;
    uint256 constant FEE = 10e6;
    uint256 constant NULLIFIER_A = 101;
    uint256 constant NULLIFIER_B = 202;
    bytes32 constant AUTH_A = keccak256("auth-a");
    bytes32 constant AUTH_B = keccak256("auth-b");

    function setUp() public {
        usdt = new MockUSDT();
        verifier = new MockVerifier3();
        poseidon = new MockPoseidonT4();
        payroll = new PrivatePayroll(address(verifier), address(usdt), address(poseidon), escrow);

        // Escrow approves contract for direct fallback path.
        vm.prank(escrow);
        usdt.approve(address(payroll), type(uint256).max);

        // Seed balances for tests.
        usdt.mint(employer, 20_000e6);
        usdt.mint(escrow, 20_000e6);
        vm.prank(employer);
        usdt.approve(address(payroll), type(uint256).max);
    }

    function _dummyProof() internal pure returns (uint256[8] memory proof) {
        return proof;
    }

    function _requestHash(
        uint256 root,
        uint256 nullifierHash,
        address recipientAddr,
        address relayerAddr,
        uint256 fee,
        uint256 amount
    ) internal view returns (uint256) {
        return payroll.computeRequestHash(
            root,
            nullifierHash,
            recipientAddr,
            relayerAddr,
            fee,
            amount
        );
    }

    function test_RegisterRootByEscrow() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        assertTrue(payroll.knownRoots(ROOT_A));
        assertEq(payroll.latestRoot(), ROOT_A);
        assertEq(payroll.rootCount(), 1);
    }

    function test_RevertRegisterRootByNonEscrow() public {
        vm.prank(employer);
        vm.expectRevert(PrivatePayroll.Unauthorized.selector);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);
    }

    function test_DepositAndRegisterRoot() public {
        uint256 escrowBalanceBefore = usdt.balanceOf(escrow);

        vm.prank(employer);
        payroll.depositAndRegisterRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        assertTrue(payroll.knownRoots(ROOT_A));
        assertEq(payroll.latestRoot(), ROOT_A);
        assertEq(usdt.balanceOf(escrow), escrowBalanceBefore + 10_000e6);
        assertEq(usdt.balanceOf(employer), 10_000e6);
    }

    function test_ReserveAndFinalizeZeroFeeWithdrawal() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        uint256[8] memory proof = _dummyProof();
        uint256 requestHash =
            _requestHash(ROOT_A, NULLIFIER_A, recipient, relayer, FEE, AMOUNT);

        vm.prank(escrow);
        payroll.reserveZeroFeeWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash, AUTH_A);

        (uint256 storedRequestHash, bytes32 authId, , bool exists) =
            payroll.getPendingWithdrawal(NULLIFIER_A);
        assertEq(storedRequestHash, requestHash);
        assertTrue(exists);
        assertEq(authId, AUTH_A);

        vm.prank(escrow);
        payroll.finalizeZeroFeeWithdrawal(NULLIFIER_A, AUTH_A);

        assertTrue(payroll.nullifierSpent(NULLIFIER_A));
        (, , , exists) = payroll.getPendingWithdrawal(NULLIFIER_A);
        assertFalse(exists);
    }

    function test_CancelReservationAllowsRetry() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        uint256[8] memory proof = _dummyProof();
        uint256 requestHash =
            _requestHash(ROOT_A, NULLIFIER_A, recipient, relayer, FEE, AMOUNT);

        vm.prank(escrow);
        payroll.reserveZeroFeeWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash, AUTH_A);

        vm.prank(escrow);
        payroll.cancelReservedWithdrawal(NULLIFIER_A, AUTH_A, keccak256("relayer-failed"));

        (, , , bool exists) = payroll.getPendingWithdrawal(NULLIFIER_A);
        assertFalse(exists);
        assertFalse(payroll.nullifierSpent(NULLIFIER_A));

        vm.prank(escrow);
        payroll.reserveZeroFeeWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash, AUTH_B);

        (uint256 requestHashAfterRetry, bytes32 authId, , bool existsAfterRetry) =
            payroll.getPendingWithdrawal(NULLIFIER_A);
        assertTrue(existsAfterRetry);
        assertEq(requestHashAfterRetry, requestHash);
        assertEq(authId, AUTH_B);
    }

    function test_DirectWithdrawFallback() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        uint256 recipientBalanceBefore = usdt.balanceOf(recipient);
        uint256 escrowBalanceBefore = usdt.balanceOf(escrow);
        uint256[8] memory proof = _dummyProof();

        vm.prank(recipient);
        payroll.directWithdraw(proof, ROOT_A, NULLIFIER_B, AMOUNT);

        assertTrue(payroll.nullifierSpent(NULLIFIER_B));
        assertEq(usdt.balanceOf(recipient), recipientBalanceBefore + AMOUNT);
        assertEq(usdt.balanceOf(escrow), escrowBalanceBefore - AMOUNT);
    }

    function test_RevertOnUnknownRoot() public {
        uint256[8] memory proof = _dummyProof();
        vm.prank(recipient);
        vm.expectRevert(PrivatePayroll.UnknownRoot.selector);
        payroll.directWithdraw(proof, ROOT_A, NULLIFIER_B, AMOUNT);
    }

    function test_RevertOnNullifierReuse() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        uint256[8] memory proof = _dummyProof();
        vm.prank(recipient);
        payroll.directWithdraw(proof, ROOT_A, NULLIFIER_B, AMOUNT);

        vm.prank(recipientTwo);
        vm.expectRevert(PrivatePayroll.NullifierAlreadyUsed.selector);
        payroll.directWithdraw(proof, ROOT_A, NULLIFIER_B, AMOUNT);
    }

    function test_RevertOnFinalizeAuthorizationMismatch() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        uint256[8] memory proof = _dummyProof();
        uint256 requestHash =
            _requestHash(ROOT_A, NULLIFIER_A, recipient, relayer, FEE, AMOUNT);
        vm.prank(escrow);
        payroll.reserveZeroFeeWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash, AUTH_A);

        vm.prank(escrow);
        vm.expectRevert(PrivatePayroll.AuthorizationMismatch.selector);
        payroll.finalizeZeroFeeWithdrawal(NULLIFIER_A, AUTH_B);
    }

    function test_RevertWhenVerifierFails() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_B, BATCH_B, 2, 5_000e6);

        verifier.setShouldVerify(false);
        uint256[8] memory proof = _dummyProof();
        uint256 requestHash =
            _requestHash(ROOT_B, NULLIFIER_A, recipient, relayer, FEE, AMOUNT);

        vm.prank(escrow);
        vm.expectRevert(PrivatePayroll.InvalidProof.selector);
        payroll.reserveZeroFeeWithdrawal(proof, ROOT_B, NULLIFIER_A, requestHash, AUTH_A);
    }

    function test_VerifyWithdrawalView() public {
        vm.prank(escrow);
        payroll.registerRoot(ROOT_A, BATCH_A, 3, 10_000e6);

        uint256[8] memory proof = _dummyProof();
        uint256 requestHash =
            _requestHash(ROOT_A, NULLIFIER_A, recipient, relayer, FEE, AMOUNT);
        bool valid = payroll.verifyWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash);
        assertTrue(valid);

        vm.prank(escrow);
        payroll.reserveZeroFeeWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash, AUTH_A);

        valid = payroll.verifyWithdrawal(proof, ROOT_A, NULLIFIER_A, requestHash);
        assertFalse(valid);
    }
}
