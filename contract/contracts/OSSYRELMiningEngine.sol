// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IMiningEngine
/// @notice Minimal interface used by OSSYRELRewardController (and mocks in tests).
interface IMiningEngine {
    function currentEra() external view returns (uint256);
    function eraCount() external view returns (uint256);
    function eraStartTime(uint256 era) external view returns (uint256);
    function rewardPerSharePerDay(uint256 era) external view returns (uint256);
    function totalShares() external view returns (uint256);
    function advanceEra() external;
}

/// @title OSSYRELMiningEngine
/// @notice Deterministic Era + halving accounting for THE HASH LEDGER (OSSYREL).
///
/// SPEC (simulation parameters — NOT a promise of profit or return):
/// - Era 1 reward: 10 OSR per share per day. Each new Era halves the rate
///   (Era 2 = 5, Era 3 = 2.5, Era 4 = 1.25, ...).
/// - An Era ends (and the next one starts) when EITHER:
///     (a) 30 days have passed since the Era started, OR
///     (b) 150,000 new shares have been minted since the Era started,
///   whichever comes first.
/// - Era transitions are deterministic: they depend only on block.timestamp
///   and on shares minted since the Era started. They do NOT depend on any
///   user opening a website. Anyone may call advanceEra() (permissionless);
///   minting and claiming also poke it automatically, so on-chain state is
///   always settled before rewards are accrued.
/// - A single Era can never last longer than 30 days, so the lifetime reward
///   of one share is bounded by 10 * 30 * (1 + 1/2 + 1/4 + ...) = 600 OSR.
contract OSSYRELMiningEngine is AccessControl, IMiningEngine {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    /// @notice Seconds per Era when the time trigger fires.
    uint256 public constant ERA_DURATION = 30 days;
    /// @notice Shares minted inside one Era that trigger the next Era.
    uint256 public constant SHARES_PER_ERA = 150_000;
    /// @notice Era 1 reward: 10 OSR (18 decimals) per share per day.
    uint256 public constant BASE_REWARD_PER_SHARE_PER_DAY = 10 ether;

    /// @notice Current Era number, starting at 1.
    uint256 public override currentEra = 1;
    /// @notice Timestamp the current Era started.
    uint256 public eraStart;
    /// @notice Shares minted since the current Era started.
    uint256 public sharesSinceEraStart;
    /// @notice Total shares ever minted (all Eras).
    uint256 public override totalShares;

    /// @notice eraStartTime[era] — index 0 is Era 1. Grows by one per Era.
    uint256[] private _eraStartTimes;

    event EraAdvanced(uint256 indexed newEra, uint256 indexed startedAt, string reason);
    event SharesRecorded(uint256 indexed shares, uint256 totalShares);

    error NotRecorder();

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        eraStart = block.timestamp;
        _eraStartTimes.push(block.timestamp);
    }

    // ------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------

    /// @notice Number of Eras that exist so far (= currentEra).
    function eraCount() external view override returns (uint256) {
        return currentEra;
    }

    /// @notice Start timestamp of a given Era (1-based).
    function eraStartTime(uint256 era) external view override returns (uint256) {
        require(era >= 1 && era <= currentEra, "Era out of range");
        return _eraStartTimes[era - 1];
    }

    /// @notice Reward rate for an Era, in OSR wei per share per day.
    /// @dev Era 1 = 10 OSR, Era 2 = 5 OSR, Era 3 = 2.5 OSR, ... (halving).
    function rewardPerSharePerDay(uint256 era) public view override returns (uint256) {
        if (era == 0) return 0;
        uint256 halvings = era - 1;
        if (halvings >= 64) return 0; // rate has halved to dust
        return BASE_REWARD_PER_SHARE_PER_DAY >> halvings;
    }

    /// @notice True when the current Era may transition (time OR shares trigger).
    function canTransition() public view returns (bool) {
        return
            block.timestamp >= eraStart + ERA_DURATION ||
            sharesSinceEraStart >= SHARES_PER_ERA;
    }

    /// @notice Timestamp at which the time trigger would fire for the current Era.
    function nextEraAt() external view returns (uint256) {
        return eraStart + ERA_DURATION;
    }

    /// @notice How many more shares can be minted before the shares trigger fires.
    function sharesRemainingForEra() external view returns (uint256) {
        if (sharesSinceEraStart >= SHARES_PER_ERA) return 0;
        return SHARES_PER_ERA - sharesSinceEraStart;
    }

    // ------------------------------------------------------------------------
    // Era transitions (permissionless + automatic)
    // ------------------------------------------------------------------------

    /// @notice Advance the Era while a transition condition holds.
    /// @dev Permissionless by design: the Era is deterministic, anyone
    /// (owner, agent, user, keeper) may settle it. Called automatically by
    /// minting and claiming, so rewards always accrue on settled Era state.
    function advanceEra() public override {
        uint256 guard = 0;
        while (canTransition()) {
            require(++guard <= 1024, "Too many Era transitions");
            if (block.timestamp >= eraStart + ERA_DURATION) {
                // Time trigger wins: carry leftover time into the next Era.
                eraStart += ERA_DURATION;
                sharesSinceEraStart = 0;
                currentEra += 1;
                _eraStartTimes.push(eraStart);
                emit EraAdvanced(currentEra, eraStart, "time");
            } else {
                // Shares trigger: carry leftover shares into the next Era.
                sharesSinceEraStart -= SHARES_PER_ERA;
                eraStart = block.timestamp;
                currentEra += 1;
                _eraStartTimes.push(eraStart);
                emit EraAdvanced(currentEra, eraStart, "shares");
            }
        }
    }

    // ------------------------------------------------------------------------
    // Mint recording (MintController only)
    // ------------------------------------------------------------------------

    /// @notice Record newly minted shares. May itself trigger an Era transition.
    function recordMint(uint256 shares) external {
        if (!hasRole(RECORDER_ROLE, msg.sender)) revert NotRecorder();
        totalShares += shares;
        sharesSinceEraStart += shares;
        emit SharesRecorded(shares, totalShares);
        advanceEra();
    }
}
