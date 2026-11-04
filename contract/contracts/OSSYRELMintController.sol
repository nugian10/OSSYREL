// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OSSYRELNodeNFT.sol";
import "./OSSYRELMiningEngine.sol";

/// @title OSSYRELMintController
/// @notice Mint rules + BNB payment forwarding for THE HASH LEDGER (OSSYREL).
///
/// PRICES (fixed by spec — no setter, changing them needs a new deployment):
///     STARTER  0 BNB        (free, max 1 per wallet)
///     BRONZE   0.0003 BNB
///     SILVER   0.0007 BNB
///     GOLD     0.0014 BNB
///     DIAMOND  0.0042 BNB
/// - Global supply cap 5,000 enforced here AND in the NFT contract.
/// - STARTER is limited to 1 per wallet (tracked forever, even after transfer).
/// - All BNB paid is forwarded immediately to the revenue (payout) address.
///   The controller never holds user funds.
/// - Pausable by the owner (admin) — emergencies only.
///
/// AGENT ROLE — what it means in THIS contract:
/// An address with AGENT_ROLE is an automation address the owner explicitly
/// trusts (for example the user's own paired agent / backend worker). It may
/// call agentMint() to mint a Node on behalf of a user, paying the BNB
/// itself. It is NOT an on-chain identity check: this contract does NOT
/// verify SPACE ID Agent IDs or any external agent registry. If agent-only
/// minting must be enforced on-chain, a registry gate must be added and
/// audited before launch.
contract OSSYRELMintController is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    /// @notice Global max supply across all classes: 5,000.
    uint256 public constant MAX_SUPPLY = 5_000;

    uint256 public constant PRICE_STARTER = 0;
    uint256 public constant PRICE_BRONZE = 0.0003 ether;
    uint256 public constant PRICE_SILVER = 0.0007 ether;
    uint256 public constant PRICE_GOLD = 0.0014 ether;
    uint256 public constant PRICE_DIAMOND = 0.0042 ether;

    OSSYRELNodeNFT public immutable nft;
    OSSYRELMiningEngine public immutable engine;

    /// @notice Address receiving all mint payments (Binance Agentic Wallet).
    address payable public revenue;

    /// @notice True once a wallet has minted its one free STARTER.
    mapping(address => bool) public hasStarterMinted;

    event Minted(address indexed to, uint256 indexed tokenId, OSSYRELNodeNFT.Class indexed class_, uint256 price);
    event RevenueSet(address indexed revenue);

    error InsufficientPayment(uint256 required, uint256 paid);
    error MaxSupplyReached();
    error StarterLimitReached(address wallet);
    error PaymentForwardFailed();
    error ZeroAddress();

    constructor(address nft_, address engine_, address payable revenue_) {
        if (nft_ == address(0) || engine_ == address(0) || revenue_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        nft = OSSYRELNodeNFT(nft_);
        engine = OSSYRELMiningEngine(engine_);
        revenue = revenue_;
    }

    // ------------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------------

    /// @notice Change the revenue (payout) address. Owner only.
    function setRevenue(address payable revenue_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (revenue_ == address(0)) revert ZeroAddress();
        revenue = revenue_;
        emit RevenueSet(revenue_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------------
    // Pricing
    // ------------------------------------------------------------------------

    function priceOf(OSSYRELNodeNFT.Class class_) public pure returns (uint256) {
        if (class_ == OSSYRELNodeNFT.Class.STARTER) return PRICE_STARTER;
        if (class_ == OSSYRELNodeNFT.Class.BRONZE) return PRICE_BRONZE;
        if (class_ == OSSYRELNodeNFT.Class.SILVER) return PRICE_SILVER;
        if (class_ == OSSYRELNodeNFT.Class.GOLD) return PRICE_GOLD;
        return PRICE_DIAMOND;
    }

    // ------------------------------------------------------------------------
    // Minting
    // ------------------------------------------------------------------------

    /// @notice Mint a Node for yourself, paying the class price in BNB.
    function mint(OSSYRELNodeNFT.Class class_) external payable whenNotPaused nonReentrant {
        _mint(msg.sender, class_);
    }

    /// @notice Mint a Node on behalf of `user`. Only AGENT_ROLE addresses.
    /// The agent pays the BNB (msg.value); the NFT goes to `user`.
    function agentMint(address user, OSSYRELNodeNFT.Class class_)
        external
        payable
        onlyRole(AGENT_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (user == address(0)) revert ZeroAddress();
        _mint(user, class_);
    }

    function _mint(address to, OSSYRELNodeNFT.Class class_) internal {
        uint256 price = priceOf(class_);
        if (msg.value < price) revert InsufficientPayment(price, msg.value);
        if (nft.totalSupply() >= MAX_SUPPLY) revert MaxSupplyReached();
        if (class_ == OSSYRELNodeNFT.Class.STARTER) {
            if (hasStarterMinted[to]) revert StarterLimitReached(to);
            hasStarterMinted[to] = true;
        }

        // Settle any pending Era transition, then record the new shares
        // (recordMint may itself trigger a shares-based Era transition).
        engine.advanceEra();
        uint256 shares = nft.SHARES(uint256(class_));
        engine.recordMint(shares);

        // State change (NFT mint + reward settlement hook) BEFORE the
        // external BNB forward — checks-effects-interactions + nonReentrant.
        uint256 tokenId = nft.mint(to, class_);

        if (msg.value > 0) {
            (bool ok, ) = revenue.call{value: msg.value}("");
            if (!ok) revert PaymentForwardFailed();
        }

        emit Minted(to, tokenId, class_, price);
    }
}
