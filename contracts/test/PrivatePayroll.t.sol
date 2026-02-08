// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PrivatePayroll} from "../src/PrivatePayroll.sol";
import {IPoseidonT4} from "../src/PoseidonT4.sol";
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

contract MockVerifier6 {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[6] calldata
    ) external pure returns (bool) {
        return true;
    }
}

contract PrivatePayrollTest is Test {
    PrivatePayroll public payroll;
    MockUSDT public usdt;
    MockVerifier6 public verifier;
    address public poseidonAddr;

    address public employer = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public charlie = address(0x4);
    address public escrow = address(0x5); // EOA that holds all funds

    uint256 constant ALICE_SALARY = 3000e6;
    uint256 constant BOB_SALARY = 4000e6;
    uint256 constant CHARLIE_SALARY = 3000e6;
    uint256 constant TOTAL = ALICE_SALARY + BOB_SALARY + CHARLIE_SALARY;

    // Test salts
    uint256 constant ALICE_SALT = 12345;
    uint256 constant BOB_SALT = 67890;
    uint256 constant CHARLIE_SALT = 11111;

    // Commitments will be computed after Poseidon is deployed
    uint256[5] commitments;
    address[5] recipients;

    function _deployPoseidon() internal returns (address) {
        bytes memory bytecode = vm.parseBytes(vm.readFile("poseidon_bytecode.txt"));
        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(deployed != address(0), "Poseidon deployment failed");
        return deployed;
    }

    function _computeCommitment(
        address recipient,
        uint256 amount,
        uint256 salt
    ) internal view returns (uint256) {
        return IPoseidonT4(poseidonAddr).poseidon(
            [uint256(uint160(recipient)), amount, salt]
        );
    }

    function setUp() public {
        usdt = new MockUSDT();
        verifier = new MockVerifier6();
        poseidonAddr = _deployPoseidon();

        payroll = new PrivatePayroll(
            address(verifier),
            address(usdt),
            poseidonAddr,
            escrow
        );

        // Escrow approves contract for unlimited transfers (enables fallback claims)
        vm.prank(escrow);
        usdt.approve(address(payroll), type(uint256).max);

        // Compute commitments
        commitments[0] = _computeCommitment(alice, ALICE_SALARY, ALICE_SALT);
        commitments[1] = _computeCommitment(bob, BOB_SALARY, BOB_SALT);
        commitments[2] = _computeCommitment(charlie, CHARLIE_SALARY, CHARLIE_SALT);
        commitments[3] = _computeCommitment(address(0), 0, 0);
        commitments[4] = _computeCommitment(address(0), 0, 0);

        recipients = [alice, bob, charlie, address(0), address(0)];

        // Fund employer
        usdt.mint(employer, TOTAL);
        vm.prank(employer);
        usdt.approve(address(payroll), TOTAL);
    }

    function _createTestPayroll() internal returns (uint256) {
        uint256[8] memory proof;
        vm.prank(employer);
        return payroll.createPayroll(proof, TOTAL, commitments, recipients);
    }

    function test_CreatePayrollWithProof() public {
        uint256 payrollId = _createTestPayroll();

        (
            address emp,
            uint256 total,
            uint256 claimedCount,
            uint256 claimedAmount,
            uint256 createdAt
        ) = payroll.getPayrollInfo(payrollId);

        assertEq(emp, employer);
        assertEq(total, TOTAL);
        assertEq(claimedCount, 0);
        assertEq(claimedAmount, 0);
        assertGt(createdAt, 0);

        // Verify funds in escrow (not contract)
        assertEq(usdt.balanceOf(escrow), TOTAL);
        assertEq(usdt.balanceOf(address(payroll)), 0);
        assertEq(usdt.balanceOf(employer), 0);

        // Verify commitments stored
        uint256[5] memory stored = payroll.getCommitments(payrollId);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(stored[i], commitments[i]);
        }
    }

    function test_ClaimPayment() public {
        uint256 payrollId = _createTestPayroll();

        // Alice claims
        vm.prank(alice);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT);

        assertEq(usdt.balanceOf(alice), ALICE_SALARY);
        assertTrue(payroll.isClaimed(payrollId, 0));

        // Bob claims
        vm.prank(bob);
        payroll.claimPayment(payrollId, 1, BOB_SALARY, BOB_SALT);

        assertEq(usdt.balanceOf(bob), BOB_SALARY);
        assertTrue(payroll.isClaimed(payrollId, 1));

        // Charlie claims
        vm.prank(charlie);
        payroll.claimPayment(payrollId, 2, CHARLIE_SALARY, CHARLIE_SALT);

        assertEq(usdt.balanceOf(charlie), CHARLIE_SALARY);
        assertEq(usdt.balanceOf(escrow), 0); // All claimed from escrow
    }

    function test_RevertOnDoubleClaim() public {
        uint256 payrollId = _createTestPayroll();

        vm.prank(alice);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT);

        vm.prank(alice);
        vm.expectRevert(PrivatePayroll.AlreadyClaimed.selector);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT);
    }

    function test_RevertOnWrongRecipient() public {
        uint256 payrollId = _createTestPayroll();

        // Bob tries to claim Alice's slot
        vm.prank(bob);
        vm.expectRevert(PrivatePayroll.InvalidClaim.selector);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT);
    }

    function test_RevertOnWrongAmount() public {
        uint256 payrollId = _createTestPayroll();

        // Alice tries to claim with wrong amount (Poseidon hash won't match)
        vm.prank(alice);
        vm.expectRevert(PrivatePayroll.InvalidClaim.selector);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY + 1, ALICE_SALT);
    }

    function test_RevertOnWrongSalt() public {
        uint256 payrollId = _createTestPayroll();

        vm.prank(alice);
        vm.expectRevert(PrivatePayroll.InvalidClaim.selector);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT + 1);
    }

    function test_ReclaimAfterDeadline() public {
        uint256 payrollId = _createTestPayroll();

        // Only Alice claims
        vm.prank(alice);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT);

        // Try to reclaim too early
        vm.prank(employer);
        vm.expectRevert(PrivatePayroll.TooEarly.selector);
        payroll.reclaimUnclaimed(payrollId);

        // Warp past deadline
        vm.warp(block.timestamp + 30 days + 1);

        uint256 remaining = TOTAL - ALICE_SALARY;
        vm.prank(employer);
        payroll.reclaimUnclaimed(payrollId);

        assertEq(usdt.balanceOf(employer), remaining);
    }

    function test_RevertOnNonEmployerReclaim() public {
        uint256 payrollId = _createTestPayroll();
        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(alice);
        vm.expectRevert(PrivatePayroll.Unauthorized.selector);
        payroll.reclaimUnclaimed(payrollId);
    }

    // ============ Zero-Fee Path Tests ============

    function test_VerifyClaim() public {
        uint256 payrollId = _createTestPayroll();

        // Valid claim should return true
        bool valid = payroll.verifyClaim(payrollId, 0, alice, ALICE_SALARY, ALICE_SALT);
        assertTrue(valid);

        // Wrong recipient should return false
        valid = payroll.verifyClaim(payrollId, 0, bob, ALICE_SALARY, ALICE_SALT);
        assertFalse(valid);

        // Wrong amount should return false
        valid = payroll.verifyClaim(payrollId, 0, alice, ALICE_SALARY + 1, ALICE_SALT);
        assertFalse(valid);

        // Wrong salt should return false
        valid = payroll.verifyClaim(payrollId, 0, alice, ALICE_SALARY, ALICE_SALT + 1);
        assertFalse(valid);
    }

    function test_MarkClaimedZeroFee() public {
        uint256 payrollId = _createTestPayroll();

        // Escrow (backend) marks claim after doing EIP-3009 transfer
        vm.prank(escrow);
        payroll.markClaimedZeroFee(payrollId, 0, alice, ALICE_SALARY, ALICE_SALT);

        // Should be marked as claimed
        assertTrue(payroll.isClaimed(payrollId, 0));

        // Should not be claimable again
        vm.prank(alice);
        vm.expectRevert(PrivatePayroll.AlreadyClaimed.selector);
        payroll.claimPayment(payrollId, 0, ALICE_SALARY, ALICE_SALT);
    }

    function test_RevertMarkClaimedZeroFeeNotEscrow() public {
        uint256 payrollId = _createTestPayroll();

        // Non-escrow cannot call markClaimedZeroFee
        vm.prank(alice);
        vm.expectRevert(PrivatePayroll.Unauthorized.selector);
        payroll.markClaimedZeroFee(payrollId, 0, alice, ALICE_SALARY, ALICE_SALT);
    }

    function test_ZeroFeeAndDirectClaimsMixed() public {
        uint256 payrollId = _createTestPayroll();

        // Alice uses zero-fee (backend marks)
        vm.prank(escrow);
        payroll.markClaimedZeroFee(payrollId, 0, alice, ALICE_SALARY, ALICE_SALT);

        // Bob uses direct (fallback)
        vm.prank(bob);
        payroll.claimPayment(payrollId, 1, BOB_SALARY, BOB_SALT);

        // Both should be claimed
        assertTrue(payroll.isClaimed(payrollId, 0));
        assertTrue(payroll.isClaimed(payrollId, 1));

        // Bob should have received funds from escrow
        assertEq(usdt.balanceOf(bob), BOB_SALARY);
    }
}
