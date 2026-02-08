// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PrivatePayroll} from "../src/PrivatePayroll.sol";
import {Groth16Verifier} from "../src/Verifier.sol";

/**
 * @title DeployTestnet
 * @notice Deployment script for Plasma testnet using existing USDT0
 *
 * Usage:
 *   ESCROW_ADDRESS=0x... forge script script/DeployTestnet.s.sol --tc DeployTestnetScript \
 *     --rpc-url https://testnet-rpc.plasma.to --broadcast --private-key $PRIVATE_KEY
 */
contract DeployTestnetScript is Script {
    // Plasma testnet USDT0
    address constant USDT0 = 0x502012b361AebCE43b26Ec812B74D9a51dB4D412;

    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address escrowAddress = vm.envAddress("ESCROW_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy PoseidonT4 from bytecode
        bytes memory poseidonBytecode = vm.parseBytes(vm.readFile("poseidon_bytecode.txt"));
        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(poseidonBytecode, 0x20), mload(poseidonBytecode))
        }
        require(poseidonAddr != address(0), "Poseidon deployment failed");
        console2.log("PoseidonT4 deployed at:", poseidonAddr);

        // 2. Deploy Groth16 Verifier
        Groth16Verifier verifier = new Groth16Verifier();
        console2.log("Verifier deployed at:", address(verifier));

        // 3. Deploy PrivatePayroll with existing USDT0
        PrivatePayroll payroll = new PrivatePayroll(
            address(verifier),
            USDT0,
            poseidonAddr,
            escrowAddress
        );
        console2.log("PrivatePayroll deployed at:", address(payroll));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Deployment complete!");
        console2.log("");
        console2.log("Addresses:");
        console2.log("  PrivatePayroll:", address(payroll));
        console2.log("  Verifier:", address(verifier));
        console2.log("  PoseidonT4:", poseidonAddr);
        console2.log("  USDT0:", USDT0);
        console2.log("  Escrow:", escrowAddress);
        console2.log("");
        console2.log("IMPORTANT: Escrow must approve contract for direct claims.");
    }
}
