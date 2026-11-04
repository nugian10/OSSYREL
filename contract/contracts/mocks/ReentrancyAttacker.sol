// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test-only attacker: its receive() tries to re-enter MintController.mint
/// while the controller is forwarding the mint payment to it (revenue address).
/// The controller's ReentrancyGuard must make the re-entrant call revert.
contract ReentrancyAttacker {
    address public controller;
    uint256 public reentryAttempts;
    bool public reentryBlocked;

    constructor(address controller_) {
        controller = controller_;
    }

    /// @notice Start an outer mint (BRONZE = class 1) paying 0.0003 BNB.
    function attackMint() external payable {
        (bool ok, ) = controller.call{value: msg.value}(
            abi.encodeWithSignature("mint(uint8)", 1)
        );
        require(ok, "outer mint failed");
    }

    receive() external payable {
        reentryAttempts += 1;
        // Try to mint again with the BNB just received. Must revert.
        (bool ok, ) = controller.call{value: 0.0003 ether}(
            abi.encodeWithSignature("mint(uint8)", 1)
        );
        if (!ok) {
            reentryBlocked = true;
        }
    }

    /// @notice Accept the NFT minted to this contract by the outer mint call.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
