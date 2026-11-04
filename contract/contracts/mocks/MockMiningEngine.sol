// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../OSSYRELMiningEngine.sol";

/// @notice Test-only mock of the MiningEngine with a settable reward rate.
/// Used to prove the RewardController's mining-pool cap logic (a real pool
/// exhaustion is unreachable under the fixed spec: max 750,000 shares x
/// max 600 OSR/share lifetime = 450M OSR < 700M pool).
contract MockMiningEngine is IMiningEngine {
    uint256 public override currentEra = 1;
    uint256 public rate = 10 ether;
    uint256 public startTime;
    uint256 public override totalShares;

    constructor() {
        startTime = block.timestamp;
    }

    function setRate(uint256 r) external {
        rate = r;
    }

    function setTotalShares(uint256 s) external {
        totalShares = s;
    }

    function eraCount() external view override returns (uint256) {
        return currentEra;
    }

    function eraStartTime(uint256 era) external view override returns (uint256) {
        require(era == 1, "mock: only era 1");
        return startTime;
    }

    function rewardPerSharePerDay(uint256) external view override returns (uint256) {
        return rate;
    }

    function advanceEra() external override {}
}
