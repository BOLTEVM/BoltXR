// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC721Utils} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Utils.sol";
import {WatchPriceTable} from "./WatchPriceTable.sol";

/// @dev ERC-20 and ERC-721 share `balanceOf(address)`.
interface IPassBalance {
    function balanceOf(address account) external view returns (uint256);
}

interface IPassBalance1155 {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/**
 * @title Iced-Out XR Watches
 * @notice 150 ERC-721 XR watch wallets. Tokens mint in order (#1 first, the Mythic #150 last) on a
 *         rising curve: mint #1 costs 0.001 ETH, #150 costs 1 ETH, and every mint lifts the next
 *         price by ~4.75 % (see WatchPriceTable). The price only ever goes up.
 *
 *         Phases: Closed -> Allowlist (callers must hold at least `passMinBalance` of a pass
 *         token: an ERC-20, an ERC-721 or one id of an ERC-1155) -> Public. The owner moves
 *         between them. The pass is checked live, so it gates who can mint during the allowlist
 *         phase; it is not a one-claim-per-pass ticket (pair it with maxPerWallet).
 *
 *         msg.value is the most the caller agrees to pay. The contract charges the price at
 *         execution and refunds the rest in the same transaction; if the price has moved above
 *         msg.value it reverts with the exact amount required. Send exactly quote(quantity) to
 *         get that price or a revert; send more only as deliberate slippage tolerance (other
 *         mints landing first move you to later, dearer ids, up to what you sent).
 */
contract IcedOutXRWatches is ERC721, ERC2981, Ownable2Step, ReentrancyGuard {
    using Strings for uint256;

    enum Phase {
        Closed,
        Allowlist,
        Public
    }

    /// @dev Balance: ERC-20 or ERC-721 `balanceOf(holder)`. ERC1155: `balanceOf(holder, passId)`.
    enum PassKind {
        Balance,
        ERC1155
    }

    uint256 public constant MAX_SUPPLY = 150;

    Phase public phase;
    address public passToken;
    PassKind public passKind;
    uint256 public passId;
    /// @notice Pass balance an address needs during the allowlist phase (e.g. 1e18 for one whole ERC-20 token).
    uint256 public passMinBalance;
    /// @notice Most tokens one address may mint (0 = no limit).
    uint256 public maxPerWallet;
    bool public metadataFrozen;
    /// @notice Tokens minted by each address (transfers do not change it).
    mapping(address => uint256) public mintedBy;

    uint256 private _minted;
    string private _base;
    string private _contractURI;

    event Minted(address indexed to, uint256 indexed firstId, uint256 quantity, uint256 paid);
    event PhaseChanged(Phase newPhase);
    event PassTokenChanged(address indexed token, PassKind kind, uint256 id, uint256 minBalance);
    event MaxPerWalletChanged(uint256 newMax);
    event ContractURIUpdated();
    event MetadataFrozen();
    event Withdrawn(address indexed to, uint256 amount);
    /// @dev ERC-4906: marketplaces refresh every token's metadata.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    error MintClosed();
    error NotOnAllowlist(address account);
    error ZeroQuantity();
    error SoldOut(uint256 remaining);
    error WalletLimit(uint256 remainingForWallet);
    error InsufficientPayment(uint256 required, uint256 sent);
    error RefundFailed();
    error MetadataIsFrozen();
    error NotAContract(address token);
    error NothingToWithdraw();
    error WithdrawFailed();
    error ZeroAddress();
    error EmptyBaseURI();
    error RenounceDisabled();

    /// @param initialOwner      receives ownership (use a multisig on mainnet)
    /// @param baseURI_          metadata folder, ending in "/" (token #7 -> baseURI_ + "007.json")
    /// @param royaltyReceiver   ERC-2981 royalty receiver
    /// @param royaltyBps        ERC-2981 royalty in basis points (500 = 5 %)
    /// @param passToken_        allowlist pass token (address(0) to configure later)
    /// @param passKind_         how to read the pass balance
    /// @param passId_           ERC-1155 id (ignored for Balance)
    /// @param maxPerWallet_     per-address mint cap (0 = none)
    constructor(
        address initialOwner,
        string memory baseURI_,
        address royaltyReceiver,
        uint96 royaltyBps,
        address passToken_,
        PassKind passKind_,
        uint256 passId_,
        uint256 maxPerWallet_
    ) ERC721("Iced-Out XR Watches", "ICED150") Ownable(initialOwner) {
        _base = baseURI_;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
        _setPass(passToken_, passKind_, passId_, 1);
        maxPerWallet = maxPerWallet_;
    }

    // ───────────────────────────── mint ─────────────────────────────

    /// @notice Mint the next `quantity` watches to the caller, paying at least `quote(quantity)`.
    function mint(uint256 quantity) external payable nonReentrant {
        Phase p = phase;
        if (p == Phase.Closed) revert MintClosed();
        if (quantity == 0) revert ZeroQuantity();
        uint256 minted = _minted;
        if (quantity > MAX_SUPPLY - minted) revert SoldOut(MAX_SUPPLY - minted);
        if (p == Phase.Allowlist && !holdsPass(msg.sender)) revert NotOnAllowlist(msg.sender);
        uint256 limit = maxPerWallet;
        uint256 already = mintedBy[msg.sender];
        if (limit != 0 && already + quantity > limit) revert WalletLimit(already >= limit ? 0 : limit - already);

        uint256 first = minted + 1;
        uint256 cost = WatchPriceTable.sum(first, quantity);
        if (msg.value < cost) revert InsufficientPayment(cost, msg.value);

        // effects - every token exists before any external call (the receiver hooks, the refund),
        // so the contract never looks half-minted to anyone the hooks call into
        uint256 end = first + quantity;
        _minted = minted + quantity;
        mintedBy[msg.sender] = already + quantity;
        for (uint256 id = first; id < end; ++id) _mint(msg.sender, id);
        emit Minted(msg.sender, first, quantity, cost);

        // interactions
        if (msg.sender.code.length != 0) {
            for (uint256 id = first; id < end; ++id) {
                ERC721Utils.checkOnERC721Received(msg.sender, address(0), msg.sender, id, "");
            }
        }

        uint256 change = msg.value - cost;
        if (change != 0) {
            (bool ok, ) = payable(msg.sender).call{value: change}("");
            if (!ok) revert RefundFailed();
        }
    }

    // ───────────────────────────── views ─────────────────────────────

    function totalMinted() public view returns (uint256) {
        return _minted;
    }

    /// @notice Tokens are never burned, so the supply is the number minted.
    function totalSupply() external view returns (uint256) {
        return _minted;
    }

    function remaining() external view returns (uint256) {
        return MAX_SUPPLY - _minted;
    }

    /// @notice Price in wei of mint number `n` (1-based) - the curve, whatever has sold.
    function priceAt(uint256 n) external pure returns (uint256) {
        return WatchPriceTable.priceOf(n);
    }

    /// @notice Price in wei of the next mint (0 once sold out).
    function nextPrice() public view returns (uint256) {
        return _minted >= MAX_SUPPLY ? 0 : WatchPriceTable.priceOf(_minted + 1);
    }

    /// @notice Cost in wei of minting the next `quantity` watches now.
    function quote(uint256 quantity) external view returns (uint256) {
        if (quantity == 0) revert ZeroQuantity();
        if (quantity > MAX_SUPPLY - _minted) revert SoldOut(MAX_SUPPLY - _minted);
        return WatchPriceTable.sum(_minted + 1, quantity);
    }

    /// @notice Whether `account` holds at least `passMinBalance` of the pass. False when no pass is
    ///         configured, or the pass contract reverts or answers garbage.
    function holdsPass(address account) public view returns (bool) {
        address token = passToken;
        if (token == address(0) || token.code.length == 0) return false;
        bytes memory data = passKind == PassKind.ERC1155
            ? abi.encodeWithSelector(IPassBalance1155.balanceOf.selector, account, passId)
            : abi.encodeWithSelector(IPassBalance.balanceOf.selector, account);
        (bool ok, bytes memory ret) = token.staticcall(data);
        if (!ok || ret.length < 32) return false;
        return abi.decode(ret, (uint256)) >= passMinBalance;
    }

    /// @notice Everything the mint modal needs for `account`, in one call.
    /// @return phase_          current phase
    /// @return minted          tokens minted so far
    /// @return price           price of the next mint in wei (0 once sold out)
    /// @return walletMinted    tokens `account` has minted
    /// @return walletLimit     per-address cap (0 = none)
    /// @return pass            whether `account` holds a pass
    function mintInfo(address account)
        external
        view
        returns (Phase phase_, uint256 minted, uint256 price, uint256 walletMinted, uint256 walletLimit, bool pass)
    {
        return (phase, _minted, nextPrice(), mintedBy[account], maxPerWallet, holdsPass(account));
    }

    /// @notice Token ids `account` owns, ascending (at most 150 to scan).
    function tokensOfOwner(address account) external view returns (uint256[] memory ids) {
        if (account == address(0)) return ids;
        uint256 n = balanceOf(account);
        ids = new uint256[](n);
        if (n == 0) return ids;
        uint256 found;
        uint256 minted = _minted;
        for (uint256 id = 1; id <= minted && found < n; ++id) {
            if (_ownerOf(id) == account) ids[found++] = id;
        }
    }

    /// @notice token #7 -> baseURI + "007.json" (the 150Watches/metadata file names).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory base = _base;
        if (bytes(base).length == 0) return "";
        string memory digits = tokenId.toString();
        if (tokenId < 10) digits = string.concat("00", digits);
        else if (tokenId < 100) digits = string.concat("0", digits);
        return string.concat(base, digits, ".json");
    }

    function baseURI() external view returns (string memory) {
        return _base;
    }

    /// @notice Collection-level metadata (OpenSea contractURI).
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    // ───────────────────────────── owner ─────────────────────────────

    function setPhase(Phase newPhase) external onlyOwner {
        phase = newPhase;
        emit PhaseChanged(newPhase);
    }

    /// @notice Set the allowlist pass (address(0) clears it - nobody passes until one is set) and the
    ///         balance a holder needs: 1 for an ERC-721 or ERC-1155 pass, e.g. 1e18 for one whole ERC-20.
    function setPassToken(address token, PassKind kind, uint256 id, uint256 minBalance) external onlyOwner {
        _setPass(token, kind, id, minBalance);
    }

    function setMaxPerWallet(uint256 newMax) external onlyOwner {
        maxPerWallet = newMax;
        emit MaxPerWalletChanged(newMax);
    }

    function setBaseURI(string calldata newBase) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _base = newBase;
        emit BatchMetadataUpdate(1, MAX_SUPPLY);
    }

    function setContractURI(string calldata newURI) external onlyOwner {
        _contractURI = newURI;
        emit ContractURIUpdated();
    }

    /// @notice Lock the base URI forever (it must be set first).
    function freezeMetadata() external onlyOwner {
        if (bytes(_base).length == 0) revert EmptyBaseURI();
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    function setDefaultRoyalty(address receiver, uint96 bps) external onlyOwner {
        _setDefaultRoyalty(receiver, bps);
    }

    /// @notice Send the mint proceeds to `to`.
    function withdraw(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    /// @notice Disabled: without an owner the proceeds could never be withdrawn.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function _setPass(address token, PassKind kind, uint256 id, uint256 minBalance) private {
        if (token != address(0) && token.code.length == 0) revert NotAContract(token);
        if (minBalance == 0) revert ZeroQuantity();
        passToken = token;
        passKind = kind;
        passId = id;
        passMinBalance = minBalance;
        emit PassTokenChanged(token, kind, id, minBalance);
    }
}
