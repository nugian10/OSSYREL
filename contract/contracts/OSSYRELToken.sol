// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title OSSYRELToken (OSR)
/// @notice BEP-20 reward token for THE HASH LEDGER (OSSYREL), BNB Chain.
/// - Max supply: 1,000,000,000 OSR (hard cap, enforced by ERC20Capped).
/// - Reserve: 300,000,000 OSR minted once at deployment to the treasury
///   (owner) address. Mining pool: max 700,000,000 OSR, minted only by the
///   RewardController as users claim — never minted speculatively.
/// - No wild minting: only addresses with MINTER_ROLE can mint, and the cap
///   makes any mint above 1B OSR revert.
/// - OSR is a simulation / in-ecosystem reward unit. It is NOT a promise of
///   profit, return, or exchange value. Real reward distribution must NOT be
///   enabled before an independent security review (see README.md).
contract OSSYRELToken is ERC20, ERC20Capped, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Hard cap: 1,000,000,000 OSR.
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;
    /// @notice Reserve allocation minted at deployment: 300,000,000 OSR.
    uint256 public constant RESERVE_SUPPLY = 300_000_000 ether;
    /// @notice Mining pool allocation: max 700,000,000 OSR (enforced in RewardController).
    uint256 public constant MINING_POOL = 700_000_000 ether;

    error ZeroAddress();

    /// @param treasury Address receiving the 300,000,000 OSR reserve (owner).
    constructor(address treasury) ERC20("OSSYREL", "OSR") ERC20Capped(MAX_SUPPLY) {
        if (treasury == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _mint(treasury, RESERVE_SUPPLY);
    }

    /// @notice Mint new OSR. Only MINTER_ROLE (RewardController after wiring).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    // ERC20Capped overrides _update; resolve the inheritance.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Capped) {
        super._update(from, to, value);
    }
}
