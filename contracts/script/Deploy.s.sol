// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PrivatePayroll} from "../src/PrivatePayroll.sol";
import {Groth16Verifier as WithdrawVerifier} from "../src/WithdrawVerifier.sol";

/**
 * @title Deploy
 * @notice Deployment script for Private Payroll pooled-note contracts with escrow
 *
 * Usage (localhost):
 *   ESCROW_ADDRESS=0x... \
 *   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key $PRIVATE_KEY
 *
 * Usage (Plasma testnet):
 *   ESCROW_ADDRESS=0x... \
 *   forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.plasma.to --broadcast --private-key $PRIVATE_KEY
 *
 * Optional:
 *   DEPLOY_WITHDRAW_VERIFIER=false WITHDRAW_VERIFIER_ADDRESS=0x...
 *   (reuse existing verifier instead of deploying a fresh one)
 *
 * Note: ESCROW_ADDRESS should be an EOA that will hold funds and sign EIP-3009 for zero-fee transfers.
 *       After deployment, escrow must call usdt.approve(payroll, type(uint256).max) to enable direct claims.
 */
contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address escrowAddress = vm.envAddress("ESCROW_ADDRESS");
        bool deployWithdrawVerifier = vm.envOr("DEPLOY_WITHDRAW_VERIFIER", true);
        address withdrawVerifierAddress = vm.envOr("WITHDRAW_VERIFIER_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy PoseidonT4 from bytecode
        bytes memory poseidonBytecode = vm.parseBytes(vm.readFile("poseidon_bytecode.txt"));
        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(poseidonBytecode, 0x20), mload(poseidonBytecode))
        }
        require(poseidonAddr != address(0), "Poseidon deployment failed");
        console2.log("PoseidonT4 deployed at:", poseidonAddr);

        // 2. Deploy or reuse withdrawal verifier (3 public signals)
        if (deployWithdrawVerifier || withdrawVerifierAddress == address(0)) {
            WithdrawVerifier verifier = new WithdrawVerifier();
            withdrawVerifierAddress = address(verifier);
            console2.log("Withdrawal verifier deployed at:", withdrawVerifierAddress);
        } else {
            console2.log("Reusing withdrawal verifier:", withdrawVerifierAddress);
        }

        // 3. Deploy MockUSDT
        MockUSDT usdt = new MockUSDT();
        console2.log("MockUSDT deployed at:", address(usdt));

        // 4. Deploy PrivatePayroll with escrow
        PrivatePayroll payroll =
            new PrivatePayroll(
                withdrawVerifierAddress,
                address(usdt),
                poseidonAddr,
                escrowAddress
            );
        console2.log("PrivatePayroll deployed at:", address(payroll));
        console2.log("Escrow EOA:", escrowAddress);

        vm.stopBroadcast();

        console2.log("");
        console2.log("Deployment complete!");
        console2.log("");
        console2.log("IMPORTANT: Escrow must approve contract for direct claims.");
        console2.log("Run this command with escrow private key:");
        console2.log("cast send <USDT> 'approve(address,uint256)' <PAYROLL> max --private-key $ESCROW_KEY");
        console2.log("");
        console2.log("Addresses:");
        console2.log("  payroll:", address(payroll));
        console2.log("  verifier:", withdrawVerifierAddress);
        console2.log("  poseidon:", poseidonAddr);
        console2.log("  usdt:", address(usdt));
        console2.log("  escrow:", escrowAddress);
    }
}

/**
 * @title MockUSDT
 * @notice Simple ERC20 for testing
 */
contract MockUSDT {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

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
