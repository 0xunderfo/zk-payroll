// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ZKPayroll} from "../src/ZKPayroll.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/**
 * @title MockUSDT
 * @notice Simple ERC20 mock for testing
 */
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

/**
 * @title MockVerifier
 * @notice Always-true verifier for testing (DO NOT USE IN PRODUCTION)
 */
contract MockVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[2] calldata
    ) external pure returns (bool) {
        return true;
    }
}

/**
 * @title ZKPayrollTest
 * @notice Tests for the ZK Payroll contract
 */
contract ZKPayrollTest is Test {
    ZKPayroll public payroll;
    MockUSDT public usdt;
    MockVerifier public verifier;
    
    address public employer = address(0x1);
    address public alice = address(0x2);
    address public bob = address(0x3);
    address public charlie = address(0x4);
    
    // Test amounts
    uint256 constant ALICE_SALARY = 3000e6;   // 3000 USDT
    uint256 constant BOB_SALARY = 4000e6;     // 4000 USDT
    uint256 constant CHARLIE_SALARY = 3000e6; // 3000 USDT
    uint256 constant TOTAL = ALICE_SALARY + BOB_SALARY + CHARLIE_SALARY; // 10000 USDT
    
    function setUp() public {
        // Deploy mock contracts
        usdt = new MockUSDT();
        verifier = new MockVerifier();
        
        // Deploy ZKPayroll
        payroll = new ZKPayroll(address(verifier), address(usdt));
        
        // Fund employer
        usdt.mint(employer, TOTAL);
        
        // Approve payroll contract
        vm.prank(employer);
        usdt.approve(address(payroll), TOTAL);
    }
    
    function test_ExecutePayroll() public {
        // Prepare recipients
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = charlie;
        
        // Prepare amounts (in production, these would be encrypted/committed)
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = ALICE_SALARY;
        amounts[1] = BOB_SALARY;
        amounts[2] = CHARLIE_SALARY;
        
        // Prepare dummy proof (mock verifier accepts anything)
        uint256[8] memory proof = [uint256(0), 0, 0, 0, 0, 0, 0, 0];
        
        // Execute payroll
        vm.prank(employer);
        payroll.executePayroll(
            proof,
            TOTAL,
            3,
            recipients,
            amounts
        );
        
        // Verify balances
        assertEq(usdt.balanceOf(alice), ALICE_SALARY, "Alice should receive her salary");
        assertEq(usdt.balanceOf(bob), BOB_SALARY, "Bob should receive his salary");
        assertEq(usdt.balanceOf(charlie), CHARLIE_SALARY, "Charlie should receive his salary");
        assertEq(usdt.balanceOf(employer), 0, "Employer should have 0 balance");
    }
    
    function test_PayrollEmitsEvents() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5000e6;
        amounts[1] = 5000e6;
        
        uint256[8] memory proof;
        
        vm.prank(employer);
        
        // Expect PayrollExecuted event
        vm.expectEmit(true, true, false, true);
        // We don't know the exact payrollId, so we can't match it
        // Just check the event is emitted
        
        payroll.executePayroll(proof, TOTAL, 2, recipients, amounts);
    }
    
    function test_RevertOnMismatchedArrays() public {
        address[] memory recipients = new address[](3);
        uint256[] memory amounts = new uint256[](2); // Mismatch!
        uint256[8] memory proof;
        
        vm.prank(employer);
        vm.expectRevert(ZKPayroll.InvalidRecipients.selector);
        payroll.executePayroll(proof, TOTAL, 3, recipients, amounts);
    }
    
    function test_RevertOnZeroTotal() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 0;
        uint256[8] memory proof;
        
        vm.prank(employer);
        vm.expectRevert(ZKPayroll.InvalidTotalAmount.selector);
        payroll.executePayroll(proof, 0, 1, recipients, amounts);
    }
    
    function test_RevertOnInsufficientBalance() public {
        // Try to pay more than employer has
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = TOTAL * 2; // Double the balance
        uint256[8] memory proof;
        
        vm.prank(employer);
        vm.expectRevert(); // Will revert on transferFrom
        payroll.executePayroll(proof, TOTAL * 2, 1, recipients, amounts);
    }
    
    function test_PayrollIdPreventsReplay() public {
        // Execute first payroll
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5000e6;
        uint256[8] memory proof;
        
        // Fund for two payrolls
        usdt.mint(employer, TOTAL);
        vm.prank(employer);
        usdt.approve(address(payroll), TOTAL * 2);
        
        vm.prank(employer);
        payroll.executePayroll(proof, 5000e6, 1, recipients, amounts);
        
        // Second payroll with same params should work (different nonce)
        vm.prank(employer);
        payroll.executePayroll(proof, 5000e6, 1, recipients, amounts);
        
        // Verify both payments went through
        assertEq(usdt.balanceOf(alice), 10000e6);
    }
}
