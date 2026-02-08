// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC20
 * @notice Minimal ERC20 interface for Private Payroll
 * @dev We only need transfer functions for our use case
 * 
 * NOTE: Plasma USDT may have additional features (zero-fee transfers)
 *       but the basic ERC20 interface should work
 */
interface IERC20 {
    /**
     * @notice Returns the name of the token
     */
    function name() external view returns (string memory);
    
    /**
     * @notice Returns the symbol of the token
     */
    function symbol() external view returns (string memory);
    
    /**
     * @notice Returns the number of decimals
     */
    function decimals() external view returns (uint8);
    
    /**
     * @notice Returns the total supply
     */
    function totalSupply() external view returns (uint256);
    
    /**
     * @notice Returns the balance of an account
     * @param account The address to query
     */
    function balanceOf(address account) external view returns (uint256);
    
    /**
     * @notice Returns the allowance for a spender
     * @param owner The token owner
     * @param spender The spender
     */
    function allowance(address owner, address spender) external view returns (uint256);
    
    /**
     * @notice Transfers tokens to a recipient
     * @param to The recipient address
     * @param amount The amount to transfer
     * @return success True if transfer succeeded
     */
    function transfer(address to, uint256 amount) external returns (bool);
    
    /**
     * @notice Approves a spender to transfer tokens
     * @param spender The spender address
     * @param amount The amount to approve
     * @return success True if approval succeeded
     */
    function approve(address spender, uint256 amount) external returns (bool);
    
    /**
     * @notice Transfers tokens from one address to another
     * @param from The sender address
     * @param to The recipient address
     * @param amount The amount to transfer
     * @return success True if transfer succeeded
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    
    /**
     * @notice Emitted when tokens are transferred
     */
    event Transfer(address indexed from, address indexed to, uint256 value);
    
    /**
     * @notice Emitted when approval is granted
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
