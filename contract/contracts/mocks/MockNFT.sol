// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IRewardSettlerLocal {
    function settleTransfer(address from, address to, uint256 tokenId, uint256 shares) external;
}

/// @notice Test-only stand-in for the NFT contract: lets tests drive
/// RewardController.settleTransfer directly, proving the controller logic
/// in isolation (including the mining-pool cap, which is unreachable with
/// the real engine under the fixed spec).
contract MockNFT {
    function triggerSettle(address controller, address from, address to, uint256 shares) external {
        IRewardSettlerLocal(controller).settleTransfer(from, to, 0, shares);
    }
}
