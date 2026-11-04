// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OSSYRELMiningEngine.sol";
import "./OSSYRELToken.sol";

/// @title OSSYRELRewardController
/// @notice Reward accrual, claiming and transfer settlement for THE HASH LEDGER.
///
/// HOW ACCRUAL WORKS
/// - Every owner has a share balance (sum of shares of the Node NFTs they hold)
///   and a checkpoint (timestamp + Era of the last accrual).
/// - pending(owner) = accrued-but-unclaimed OSR + shares * Era rate * time
///   since the checkpoint, walked era-by-era so halvings mid-period are exact.
/// - Era 1 rate is 10 OSR per share per day; each Era halves it.
/// - Rewards are SIMULATION PARAMETERS, not a promise of profit or return.
///
/// TRANSFER SETTLEMENT (anti double-claim by design)
/// - The NFT contract calls settleTransfer() BEFORE ownership changes on
///   every mint/transfer. It accrues the OLD owner up to the transfer time
///   with the old share balance, accrues the NEW owner up to the transfer
///   time with their old share balance, then moves the token's shares.
///   The old owner keeps exactly what they earned until the transfer; the
///   new owner earns only from the transfer time onward. Nothing is earned
///   twice and nothing is lost.
/// - Only the wired NFT contract can call settleTransfer().
/// - Claims are checkpoint-based: claim() zeroes the caller's pending balance
///   in the same transaction that mints the OSR, so a second claim in the
///   same block (or ever, without new accrual) finds nothing to claim.
///
/// POOL LIMIT
/// - At most 700,000,000 OSR may ever be mined through claims (minedTotal).
///   A claim larger than the remaining pool is paid PARTIALLY, up to the
///   remainder; the unpaid rest stays pending (it can never be paid once the
///   pool is empty — claim() then reverts with PoolExhausted).
/// - Note: under the fixed spec (max 750,000 shares, Era halving) the
///   theoretical lifetime accrual is at most 450,000,000 OSR, so the pool
///   cap is a safety bound that should never bind in practice.
///
/// AGENT ROLE — what it means in THIS contract:
/// An address with AGENT_ROLE is an automation address the owner explicitly
/// trusts (for example the user's own paired agent / backend worker). It may
/// call claimFor(user) to claim on the user's behalf; the OSR always goes to
/// the USER, never to the agent. It is NOT an on-chain identity check (no
/// SPACE ID Agent ID verification in this contract).
contract OSSYRELRewardController is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    /// @notice Max OSR ever payable through mining claims: 700,000,000.
    uint256 public constant MINING_POOL = 700_000_000 ether;

    address public nft;
    IMiningEngine public engine;
    OSSYRELToken public token;

    /// @notice Total OSR ever paid out through claims.
    uint256 public minedTotal;

    /// @notice Shares currently held by an owner (sum of their NFTs' shares).
    mapping(address => uint256) public sharesOf;
    /// @notice OSR accrued but not yet claimed.
    mapping(address => uint256) public pendingAccrued;
    /// @notice Timestamp of the owner's last accrual.
    mapping(address => uint256) public checkpoint;
    /// @notice Era of the owner's last accrual (segment walk starts here).
    mapping(address => uint256) public checkpointEra;
    /// @notice Total OSR ever claimed by an owner.
    mapping(address => uint256) public totalClaimed;
    /// @notice Number of claims an owner has made.
    mapping(address => uint256) public claimCount;

    struct ClaimRecord {
        uint256 amount;
        uint256 timestamp;
        uint256 era;
    }

    /// @notice Per-owner claim history (append-only).
    mapping(address => ClaimRecord[]) public claimHistory;

    event TransferSettled(address indexed from, address indexed to, uint256 indexed tokenId, uint256 shares);
    event Claimed(address indexed user, uint256 amount, uint256 unpaidRemainder, uint256 indexed era);
    event PoolExhausted(uint256 indexed minedTotal);

    error OnlyNFT();
    error NothingToClaim();
    error PoolEmpty();
    error ZeroAddress();

    constructor(address nft_, address engine_, address token_) {
        if (nft_ == address(0) || engine_ == address(0) || token_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        nft = nft_;
        engine = IMiningEngine(engine_);
        token = OSSYRELToken(token_);
    }

    // ------------------------------------------------------------------------
    // Admin (wiring — only needed if an address must be replaced)
    // ------------------------------------------------------------------------

    function setNFT(address nft_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (nft_ == address(0)) revert ZeroAddress();
        nft = nft_;
    }

    function setEngine(address engine_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = IMiningEngine(engine_);
    }

    function setToken(address token_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token_ == address(0)) revert ZeroAddress();
        token = OSSYRELToken(token_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------------
    // Transfer settlement (called by the NFT contract, before ownership changes)
    // ------------------------------------------------------------------------

    /// @notice Settle rewards for both sides of a transfer, then move shares.
    /// Only callable by the wired NFT contract.
    function settleTransfer(address from, address to, uint256 tokenId, uint256 shares) external {
        if (msg.sender != nft) revert OnlyNFT();
        // Settle Era state first so accrual uses up-to-date segments.
        engine.advanceEra();
        _accrue(from);
        _accrue(to);
        if (from != address(0)) {
            sharesOf[from] -= shares;
        }
        if (to != address(0)) {
            sharesOf[to] += shares;
        }
        emit TransferSettled(from, to, tokenId, shares);
    }

    // ------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------

    /// @notice Total claimable OSR for an owner right now (accrued + live).
    /// @dev View-only: it does NOT settle a pending Era transition. If an
    /// Era transition is due but nobody has poked it yet, this view may lag
    /// slightly behind the true value; claim() always pokes first, so an
    /// actual claim is exact.
    function pendingReward(address owner) external view returns (uint256) {
        return pendingAccrued[owner] + _accrueView(owner, block.timestamp);
    }

    /// @notice OSR still available in the mining pool.
    function remainingPool() external view returns (uint256) {
        return MINING_POOL - minedTotal;
    }

    /// @notice Full claim history of an owner.
    function getClaimHistory(address owner) external view returns (ClaimRecord[] memory) {
        return claimHistory[owner];
    }

    // ------------------------------------------------------------------------
    // Claiming
    // ------------------------------------------------------------------------

    /// @notice Claim all of the caller's pending OSR.
    function claim() external whenNotPaused nonReentrant {
        _claim(msg.sender);
    }

    /// @notice Claim on behalf of `user`. Only AGENT_ROLE. OSR goes to `user`.
    function claimFor(address user) external onlyRole(AGENT_ROLE) whenNotPaused nonReentrant {
        _claim(user);
    }

    function _claim(address user) internal {
        engine.advanceEra();
        _accrue(user);
        uint256 amount = pendingAccrued[user];
        if (amount == 0) revert NothingToClaim();

        uint256 remaining = MINING_POOL - minedTotal;
        if (remaining == 0) revert PoolEmpty();

        // Partial payment if the claim exceeds the remaining pool.
        uint256 pay = amount > remaining ? remaining : amount;
        uint256 unpaid = amount - pay;

        // Checkpoint FIRST (effects), then mint (external call) — a second
        // claim can never re-pay the same accrual.
        pendingAccrued[user] = unpaid;
        minedTotal += pay;
        totalClaimed[user] += pay;
        claimCount[user] += 1;
        claimHistory[user].push(ClaimRecord({amount: pay, timestamp: block.timestamp, era: engine.currentEra()}));

        if (pay == remaining) emit PoolExhausted(minedTotal);
        emit Claimed(user, pay, unpaid, engine.currentEra());

        token.mint(user, pay);
    }

    // ------------------------------------------------------------------------
    // Accrual internals
    // ------------------------------------------------------------------------

    /// @notice Accrue an owner's rewards up to now and move their checkpoint.
    function _accrue(address owner) internal {
        if (owner == address(0)) return;
        uint256 shares = sharesOf[owner];
        uint256 last = checkpoint[owner];
        if (last == 0) {
            // First interaction: start the clock now, accrue nothing retroactively.
            checkpoint[owner] = block.timestamp;
            checkpointEra[owner] = engine.currentEra();
            return;
        }
        if (shares == 0 || block.timestamp <= last) {
            checkpoint[owner] = block.timestamp;
            checkpointEra[owner] = engine.currentEra();
            return;
        }
        uint256 accrued = _accrueView(owner, block.timestamp);
        pendingAccrued[owner] += accrued;
        checkpoint[owner] = block.timestamp;
        checkpointEra[owner] = engine.currentEra();
    }

    /// @notice Pure accrual math: shares * rate * time, walked era-by-era.
    /// @dev Reads Era segments from the engine. `upTo` is normally now.
    function _accrueView(address owner, uint256 upTo) internal view returns (uint256) {
        uint256 shares = sharesOf[owner];
        uint256 last = checkpoint[owner];
        if (owner == address(0) || shares == 0 || last == 0 || upTo <= last) return 0;

        uint256 current = engine.currentEra();
        uint256 startEra = checkpointEra[owner];
        if (startEra == 0) startEra = 1;
        if (startEra > current) return 0;

        uint256 total = 0;
        for (uint256 era = startEra; era <= current; era++) {
            uint256 segStart = era == startEra ? last : engine.eraStartTime(era);
            uint256 segEnd = era < current ? engine.eraStartTime(era + 1) : upTo;
            if (segEnd > segStart) {
                uint256 rate = engine.rewardPerSharePerDay(era);
                total += (shares * rate * (segEnd - segStart)) / 1 days;
            }
        }
        return total;
    }
}
