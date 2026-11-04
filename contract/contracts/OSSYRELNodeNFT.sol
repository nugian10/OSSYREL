// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Interface the NFT calls to settle rewards when a token moves.
/// Implemented by OSSYRELRewardController.
interface IRewardSettler {
    function settleTransfer(address from, address to, uint256 tokenId, uint256 shares) external;
}

/// @title OSSYRELNodeNFT
/// @notice ERC-721 Node NFTs for THE HASH LEDGER (OSSYREL), BNB Chain.
/// - Max supply (global, all classes combined): 5,000.
/// - 5 classes, fixed hash rate + shares per token:
///     STARTER  10 MH/s,   1 share
///     BRONZE  100 MH/s,  10 shares
///     SILVER  250 MH/s,  25 shares
///     GOLD    500 MH/s,  50 shares
///     DIAMOND 1500 MH/s, 150 shares
/// - Only the MintController (MINTER_ROLE) can mint.
/// - Reward settlement on transfer: before any transfer (including mint),
///   the NFT calls the RewardController so the PREVIOUS owner's rewards are
///   accrued up to the transfer time and the NEW owner starts accruing only
///   from that moment. See OSSYRELRewardController.settleTransfer.
/// - baseURI is changeable by the owner (admin) so metadata can move
///   (e.g. GitHub -> IPFS) without redeploying.
contract OSSYRELNodeNFT is ERC721, ERC721Enumerable, AccessControl {
    using Strings for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Global max supply across all classes: 5,000.
    uint256 public constant MAX_SUPPLY = 5_000;

    enum Class {
        STARTER,
        BRONZE,
        SILVER,
        GOLD,
        DIAMOND
    }

    /// @notice Hash rate (MH/s) per class, indexed by Class.
    /// Set once in the constructor; fixed by spec thereafter.
    uint256[5] public HASH_RATE;
    /// @notice Shares per token per class, indexed by Class.
    uint256[5] public SHARES;

    uint256 private _nextTokenId;
    string private _baseTokenURI;

    /// @notice RewardController that settles rewards on transfer (0 = not wired yet).
    address public rewardController;

    mapping(uint256 => Class) private _tokenClass;
    mapping(uint256 => uint256) private _tokenHashRate;
    mapping(uint256 => uint256) private _tokenShares;

    event BaseURISet(string baseURI);
    event RewardControllerSet(address indexed controller);

    error MaxSupplyReached();
    error ZeroAddress();

    constructor(string memory baseURI_) ERC721("OSSYREL Node", "OSSRN") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _baseTokenURI = baseURI_;
        HASH_RATE = [uint256(10), 100, 250, 500, 1500];
        SHARES = [uint256(1), 10, 25, 50, 150];
    }

    // ------------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------------

    /// @notice Point the NFT at the RewardController (wiring step at deploy).
    function setRewardController(address controller) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (controller == address(0)) revert ZeroAddress();
        rewardController = controller;
        emit RewardControllerSet(controller);
    }

    /// @notice Change the metadata base URI (owner only).
    function setBaseURI(string calldata baseURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseURI_;
        emit BaseURISet(baseURI_);
    }

    // ------------------------------------------------------------------------
    // Minting (MintController only)
    // ------------------------------------------------------------------------

    /// @notice Mint one Node NFT of a class. Token data is stored BEFORE
    /// _safeMint so the transfer-settlement hook can read this token's shares.
    function mint(address to, Class class_) external onlyRole(MINTER_ROLE) returns (uint256) {
        if (totalSupply() >= MAX_SUPPLY) revert MaxSupplyReached();
        uint256 tokenId = ++_nextTokenId;
        _tokenClass[tokenId] = class_;
        _tokenHashRate[tokenId] = HASH_RATE[uint256(class_)];
        _tokenShares[tokenId] = SHARES[uint256(class_)];
        _safeMint(to, tokenId);
        return tokenId;
    }

    // ------------------------------------------------------------------------
    // Transfer settlement hook
    // ------------------------------------------------------------------------

    /// @notice On every transfer (mint / transfer), settle rewards first:
    /// the old owner accrues up to now with the old share balance, the new
    /// owner accrues up to now with their old share balance, then the token's
    /// shares move. This runs BEFORE ownership changes, so the settler sees
    /// the pre-transfer state. Skipped while the RewardController is unwired.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (rewardController != address(0) && from != to) {
            IRewardSettler(rewardController).settleTransfer(
                from,
                to,
                tokenId,
                _tokenShares[tokenId]
            );
        }
        return super._update(to, tokenId, auth);
    }

    // ------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseURI(), tokenId.toString(), ".json");
    }

    function classOf(uint256 tokenId) external view returns (Class) {
        _requireOwned(tokenId);
        return _tokenClass[tokenId];
    }

    function hashRateOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _tokenHashRate[tokenId];
    }

    function sharesOfToken(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _tokenShares[tokenId];
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
