// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IcedOutXRWatches} from "../src/IcedOutXRWatches.sol";
import {WatchPriceTable} from "../src/WatchPriceTable.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {MockBalancePass, MockPass1155, RevertingPass, ReentrantMinter, NoRefundMinter, NotAReceiver, RejectsEther, BatchObserver} from "./mocks/Mocks.sol";

contract IcedOutXRWatchesTest is Test {
    IcedOutXRWatches internal watches;
    MockBalancePass internal pass;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal royalty = makeAddr("royalty");
    address internal treasury = makeAddr("treasury");

    event Minted(address indexed to, uint256 indexed firstId, uint256 quantity, uint256 paid);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    function setUp() public {
        pass = new MockBalancePass();
        watches = new IcedOutXRWatches(
            owner, "ipfs://meta/", royalty, 500, address(pass), IcedOutXRWatches.PassKind.Balance, 0, 0
        );
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ─────────── helpers ───────────

    function _open() internal {
        vm.prank(owner);
        watches.setPhase(IcedOutXRWatches.Phase.Public);
    }

    function _mint(address who, uint256 quantity) internal returns (uint256 cost) {
        cost = watches.quote(quantity);
        vm.prank(who);
        watches.mint{value: cost}(quantity);
    }

    function _sellOut() internal {
        _open();
        _mint(alice, 50);
        _mint(alice, 50);
        _mint(bob, 50);
    }

    // ─────────── the curve ───────────

    function test_CurveStartsAtOneFinneyAndEndsAtOneEther() public view {
        assertEq(watches.priceAt(1), 0.001 ether);
        assertEq(watches.priceAt(75), 0.0309 ether);
        assertEq(watches.priceAt(150), 1 ether);
    }

    function test_CurveOnlyRises() public view {
        for (uint256 n = 2; n <= 150; ++n) {
            uint256 prev = watches.priceAt(n - 1);
            uint256 cur = watches.priceAt(n);
            assertGt(cur, prev);
            // ~4.75 % a step, within the 4-significant-figure rounding
            assertGe(cur * 10_000, prev * 10_400);
            assertLe(cur * 10_000, prev * 10_560);
        }
    }

    function test_SellOutRaisesTheTableTotal() public {
        uint256 expected = WatchPriceTable.sum(1, 150);
        assertEq(expected, 22.052777 ether);
        _sellOut();
        assertEq(address(watches).balance, expected);
    }

    function test_PriceOutsideTheCurveReverts() public {
        vm.expectRevert(abi.encodeWithSelector(WatchPriceTable.PriceIndexOutOfRange.selector, 0));
        watches.priceAt(0);
        vm.expectRevert(abi.encodeWithSelector(WatchPriceTable.PriceIndexOutOfRange.selector, 151));
        watches.priceAt(151);
    }

    function testFuzz_QuoteIsTheSumOfTheNextPrices(uint256 sold, uint256 quantity) public {
        sold = bound(sold, 0, 140);
        quantity = bound(quantity, 1, 150 - sold);
        _open();
        if (sold > 0) _mint(alice, sold);
        uint256 expected;
        for (uint256 n = sold + 1; n <= sold + quantity; ++n) expected += watches.priceAt(n);
        assertEq(watches.quote(quantity), expected);
        assertEq(watches.nextPrice(), watches.priceAt(sold + 1));
    }

    // ─────────── phases & the allowlist ───────────

    function test_ClosedUntilTheOwnerOpens() public {
        vm.prank(alice);
        vm.expectRevert(IcedOutXRWatches.MintClosed.selector);
        watches.mint{value: 1 ether}(1);
    }

    function test_AllowlistNeedsAPass() public {
        vm.prank(owner);
        watches.setPhase(IcedOutXRWatches.Phase.Allowlist);
        uint256 price = watches.nextPrice();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.NotOnAllowlist.selector, bob));
        watches.mint{value: price}(1);

        pass.give(alice, 1);
        assertTrue(watches.holdsPass(alice));
        vm.prank(alice);
        watches.mint{value: price}(1);
        assertEq(watches.ownerOf(1), alice);
    }

    function test_AllowlistWith1155Pass() public {
        MockPass1155 pass1155 = new MockPass1155();
        vm.startPrank(owner);
        watches.setPassToken(address(pass1155), IcedOutXRWatches.PassKind.ERC1155, 7, 1);
        watches.setPhase(IcedOutXRWatches.Phase.Allowlist);
        vm.stopPrank();

        pass1155.give(alice, 7, 1);
        pass1155.give(bob, 8, 1); // the wrong id
        assertTrue(watches.holdsPass(alice));
        assertFalse(watches.holdsPass(bob));

        uint256 price = watches.nextPrice();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.NotOnAllowlist.selector, bob));
        watches.mint{value: price}(1);
        vm.prank(alice);
        watches.mint{value: price}(1);
        assertEq(watches.balanceOf(alice), 1);
    }

    function test_NoPassConfiguredMeansNobodyPasses() public {
        pass.give(alice, 1);
        vm.startPrank(owner);
        watches.setPassToken(address(0), IcedOutXRWatches.PassKind.Balance, 0, 1);
        watches.setPhase(IcedOutXRWatches.Phase.Allowlist);
        vm.stopPrank();
        assertFalse(watches.holdsPass(alice));
        uint256 price = watches.nextPrice();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.NotOnAllowlist.selector, alice));
        watches.mint{value: price}(1);
    }

    function test_BrokenPassContractIsNoPass() public {
        RevertingPass broken = new RevertingPass();
        vm.prank(owner);
        watches.setPassToken(address(broken), IcedOutXRWatches.PassKind.Balance, 0, 1);
        assertFalse(watches.holdsPass(alice));
    }

    function test_PassMustBeAContract() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.NotAContract.selector, alice));
        watches.setPassToken(alice, IcedOutXRWatches.PassKind.Balance, 0, 1);
    }

    function test_PublicNeedsNoPass() public {
        _open();
        assertFalse(watches.holdsPass(bob));
        _mint(bob, 1);
        assertEq(watches.ownerOf(1), bob);
    }

    function test_OwnerCanCloseAgain() public {
        _open();
        _mint(alice, 1);
        vm.prank(owner);
        watches.setPhase(IcedOutXRWatches.Phase.Closed);
        vm.prank(alice);
        vm.expectRevert(IcedOutXRWatches.MintClosed.selector);
        watches.mint{value: 1 ether}(1);
    }

    // ─────────── minting ───────────

    function test_MintsInOrderAndLiftsThePrice() public {
        _open();
        uint256 first = watches.priceAt(1);
        assertEq(watches.nextPrice(), first);

        vm.expectEmit(true, true, false, true, address(watches));
        emit Minted(alice, 1, 1, first);
        vm.prank(alice);
        watches.mint{value: first}(1);
        assertEq(watches.nextPrice(), watches.priceAt(2));

        uint256 cost = _mint(bob, 3);
        assertEq(cost, watches.priceAt(2) + watches.priceAt(3) + watches.priceAt(4));
        assertEq(watches.ownerOf(2), bob);
        assertEq(watches.ownerOf(4), bob);
        assertEq(watches.totalMinted(), 4);
        assertEq(watches.totalSupply(), 4);
        assertEq(watches.remaining(), 146);
        assertEq(address(watches).balance, first + cost);
    }

    function test_ExcessIsRefunded() public {
        _open();
        uint256 before = alice.balance;
        vm.prank(alice);
        watches.mint{value: 1 ether}(1);
        assertEq(alice.balance, before - watches.priceAt(1));
        assertEq(address(watches).balance, watches.priceAt(1));
    }

    function test_UnderpaymentRevertsWithTheExactPrice() public {
        _open();
        uint256 cost = watches.quote(2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.InsufficientPayment.selector, cost, cost - 1));
        watches.mint{value: cost - 1}(2);
    }

    function test_AStaleQuoteRevertsInsteadOfOvercharging() public {
        _open();
        uint256 aliceQuote = watches.quote(1);
        _mint(bob, 1); // bob gets in first; the price moves up
        uint256 newPrice = watches.priceAt(2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.InsufficientPayment.selector, newPrice, aliceQuote));
        watches.mint{value: aliceQuote}(1);
        assertEq(watches.balanceOf(alice), 0);
    }

    function test_ZeroQuantityReverts() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(IcedOutXRWatches.ZeroQuantity.selector);
        watches.mint(0);
        vm.expectRevert(IcedOutXRWatches.ZeroQuantity.selector);
        watches.quote(0);
    }

    function test_CannotMintPastTheSupply() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.SoldOut.selector, 150));
        watches.mint{value: 100 ether}(151);

        _mint(alice, 50);
        _mint(alice, 50);
        _mint(bob, 49);
        assertEq(watches.remaining(), 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.SoldOut.selector, 1));
        watches.mint{value: 2 ether}(2);

        uint256 last = _mint(bob, 1);
        assertEq(last, 1 ether);
        assertEq(watches.ownerOf(150), bob);
        assertEq(watches.nextPrice(), 0);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.SoldOut.selector, 0));
        watches.quote(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.SoldOut.selector, 0));
        watches.mint{value: 1 ether}(1);
    }

    function test_WalletLimit() public {
        _open();
        vm.prank(owner);
        watches.setMaxPerWallet(2);

        uint256 three = watches.quote(3);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.WalletLimit.selector, 2));
        watches.mint{value: three}(3);

        _mint(alice, 2);
        uint256 price = watches.nextPrice();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.WalletLimit.selector, 0));
        watches.mint{value: price}(1);

        // transferring away does not reset what an address has minted
        vm.prank(alice);
        watches.transferFrom(alice, bob, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.WalletLimit.selector, 0));
        watches.mint{value: price}(1);

        // lowering the limit below what someone minted still reports 0 left, not an underflow
        vm.prank(owner);
        watches.setMaxPerWallet(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.WalletLimit.selector, 0));
        watches.mint{value: price}(1);
    }

    function test_ReentryFromTheReceiverHookIsBlocked() public {
        _open();
        ReentrantMinter attacker = new ReentrantMinter(watches);
        vm.deal(address(attacker), 10 ether);
        attacker.attack{value: 1 ether}();
        assertTrue(attacker.reentryBlocked());
        assertEq(attacker.reentryError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertFalse(attacker.reentered());
        assertEq(watches.balanceOf(address(attacker)), 1);
        assertEq(watches.totalMinted(), 1);
        assertEq(address(watches).balance, watches.priceAt(1));
    }

    function test_ARefundThatCannotBeDeliveredReverts() public {
        _open();
        NoRefundMinter minter = new NoRefundMinter(watches);
        vm.deal(address(this), 10 ether);
        uint256 price = watches.nextPrice();
        vm.expectRevert(IcedOutXRWatches.RefundFailed.selector);
        minter.mintPaying{value: price + 1}(1);
        minter.mintPaying{value: price}(1); // the exact amount is fine
        assertEq(watches.ownerOf(1), address(minter));
    }

    function test_ContractsThatCannotHoldNFTsAreRefused() public {
        _open();
        NotAReceiver wallet = new NotAReceiver();
        vm.deal(address(this), 10 ether);
        uint256 price = watches.nextPrice();
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(wallet)));
        wallet.mintPaying{value: price}(watches, 1);
    }

    // ─────────── views ───────────

    function test_TokensOfOwnerFollowsTransfers() public {
        _open();
        _mint(alice, 2);
        _mint(bob, 1);
        vm.prank(alice);
        watches.transferFrom(alice, bob, 2);

        uint256[] memory a = watches.tokensOfOwner(alice);
        uint256[] memory b = watches.tokensOfOwner(bob);
        assertEq(a.length, 1);
        assertEq(a[0], 1);
        assertEq(b.length, 2);
        assertEq(b[0], 2);
        assertEq(b[1], 3);
        assertEq(watches.tokensOfOwner(treasury).length, 0);
    }

    function test_MintInfo() public {
        pass.give(alice, 1);
        vm.startPrank(owner);
        watches.setMaxPerWallet(3);
        watches.setPhase(IcedOutXRWatches.Phase.Allowlist);
        vm.stopPrank();
        uint256 price = watches.nextPrice();
        vm.prank(alice);
        watches.mint{value: price}(1);

        (IcedOutXRWatches.Phase p, uint256 minted, uint256 next, uint256 mine, uint256 limit, bool holds) =
            watches.mintInfo(alice);
        assertEq(uint8(p), uint8(IcedOutXRWatches.Phase.Allowlist));
        assertEq(minted, 1);
        assertEq(next, watches.priceAt(2));
        assertEq(mine, 1);
        assertEq(limit, 3);
        assertTrue(holds);
        (, , , , , holds) = watches.mintInfo(bob);
        assertFalse(holds);
    }

    function test_TokenURIUsesTheMetadataFileNames() public {
        _sellOut();
        assertEq(watches.tokenURI(1), "ipfs://meta/001.json");
        assertEq(watches.tokenURI(42), "ipfs://meta/042.json");
        assertEq(watches.tokenURI(150), "ipfs://meta/150.json");
    }

    function test_TokenURIForAnUnmintedTokenReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 5));
        watches.tokenURI(5);
    }

    function test_EmptyBaseURIGivesEmptyTokenURI() public {
        _open();
        _mint(alice, 1);
        vm.prank(owner);
        watches.setBaseURI("");
        assertEq(watches.tokenURI(1), "");
    }

    // ─────────── owner ───────────

    function test_OnlyTheOwnerAdministers() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.setPhase(IcedOutXRWatches.Phase.Public);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.setPassToken(address(pass), IcedOutXRWatches.PassKind.Balance, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.setMaxPerWallet(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.setBaseURI("x/");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.freezeMetadata();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.withdraw(payable(alice));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        watches.setDefaultRoyalty(alice, 100);
        vm.stopPrank();
    }

    function test_FreezingLocksTheMetadata() public {
        vm.startPrank(owner);
        vm.expectEmit(false, false, false, true, address(watches));
        emit BatchMetadataUpdate(1, 150);
        watches.setBaseURI("ipfs://final/");
        assertEq(watches.baseURI(), "ipfs://final/");
        watches.freezeMetadata();
        assertTrue(watches.metadataFrozen());
        vm.expectRevert(IcedOutXRWatches.MetadataIsFrozen.selector);
        watches.setBaseURI("ipfs://other/");
        vm.stopPrank();
    }

    function test_ContractURI() public {
        vm.prank(owner);
        watches.setContractURI("ipfs://meta/collection.json");
        assertEq(watches.contractURI(), "ipfs://meta/collection.json");
    }

    function test_WithdrawSendsTheProceeds() public {
        _open();
        uint256 paid = _mint(alice, 10);
        vm.prank(owner);
        watches.withdraw(payable(treasury));
        assertEq(treasury.balance, paid);
        assertEq(address(watches).balance, 0);

        vm.prank(owner);
        vm.expectRevert(IcedOutXRWatches.NothingToWithdraw.selector);
        watches.withdraw(payable(treasury));
        vm.prank(owner);
        vm.expectRevert(IcedOutXRWatches.ZeroAddress.selector);
        watches.withdraw(payable(address(0)));
    }

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        watches.transferOwnership(bob);
        assertEq(watches.owner(), owner);
        assertEq(watches.pendingOwner(), bob);
        vm.prank(bob);
        watches.acceptOwnership();
        assertEq(watches.owner(), bob);
    }

    function test_RoyaltiesAndInterfaces() public view {
        (address receiver, uint256 amount) = watches.royaltyInfo(1, 1 ether);
        assertEq(receiver, royalty);
        assertEq(amount, 0.05 ether);
        assertTrue(watches.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(watches.supportsInterface(0x5b5e139f)); // ERC-721 metadata
        assertTrue(watches.supportsInterface(0x2a55205a)); // ERC-2981
        assertTrue(watches.supportsInterface(0x49064906)); // ERC-4906
        assertTrue(watches.supportsInterface(0x01ffc9a7)); // ERC-165
        assertFalse(watches.supportsInterface(0xffffffff));
    }

    function test_NameAndSymbol() public view {
        assertEq(watches.name(), "Iced-Out XR Watches");
        assertEq(watches.symbol(), "ICED150");
        assertEq(watches.MAX_SUPPLY(), 150);
    }

    function test_DustDoesNotPassWhenAMinimumIsSet() public {
        vm.startPrank(owner);
        watches.setPassToken(address(pass), IcedOutXRWatches.PassKind.Balance, 0, 1e18);
        watches.setPhase(IcedOutXRWatches.Phase.Allowlist);
        vm.stopPrank();
        pass.give(alice, 1); // 1 wei of an 18-decimal pass token
        pass.give(bob, 1e18);
        assertFalse(watches.holdsPass(alice));
        assertTrue(watches.holdsPass(bob));
        uint256 price = watches.nextPrice();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IcedOutXRWatches.NotOnAllowlist.selector, alice));
        watches.mint{value: price}(1);
        vm.prank(bob);
        watches.mint{value: price}(1);
        assertEq(watches.ownerOf(1), bob);

        vm.prank(owner);
        vm.expectRevert(IcedOutXRWatches.ZeroQuantity.selector);
        watches.setPassToken(address(pass), IcedOutXRWatches.PassKind.Balance, 0, 0);

        // switching to an ERC-721 pass resets the minimum with it
        vm.prank(owner);
        watches.setPassToken(address(pass), IcedOutXRWatches.PassKind.Balance, 0, 1);
        assertTrue(watches.holdsPass(alice));
    }

    function test_OwnershipCannotBeRenounced() public {
        vm.prank(owner);
        vm.expectRevert(IcedOutXRWatches.RenounceDisabled.selector);
        watches.renounceOwnership();
        assertEq(watches.owner(), owner);
    }

    function test_CannotFreezeAnEmptyBaseURI() public {
        vm.startPrank(owner);
        watches.setBaseURI("");
        vm.expectRevert(IcedOutXRWatches.EmptyBaseURI.selector);
        watches.freezeMetadata();
        vm.stopPrank();
    }

    function test_TokensOfTheZeroAddressIsEmpty() public view {
        assertEq(watches.tokensOfOwner(address(0)).length, 0);
    }

    function test_WithdrawToARefusingAddressReverts() public {
        _open();
        _mint(alice, 1);
        RejectsEther refuser = new RejectsEther();
        vm.prank(owner);
        vm.expectRevert(IcedOutXRWatches.WithdrawFailed.selector);
        watches.withdraw(payable(address(refuser)));
        assertEq(address(watches).balance, watches.priceAt(1));
    }

    function test_RoyaltyCanBeChangedWithinTheStandard() public {
        vm.startPrank(owner);
        watches.setDefaultRoyalty(treasury, 750);
        (address receiver, uint256 amount) = watches.royaltyInfo(1, 1 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 0.075 ether);
        vm.expectRevert(abi.encodeWithSelector(ERC2981.ERC2981InvalidDefaultRoyalty.selector, 10_001, 10_000));
        watches.setDefaultRoyalty(treasury, 10_001);
        vm.stopPrank();
        assertTrue(watches.supportsInterface(type(IERC2981).interfaceId));
    }

    function test_ContractReceiversSeeACompleteBatch() public {
        _open();
        BatchObserver observer = new BatchObserver(watches);
        vm.deal(address(this), 10 ether);
        uint256 cost = watches.quote(3);
        observer.mintPaying{value: cost}(3);
        // already at the first receiver hook, the whole batch exists
        assertEq(observer.hooks(), 3);
        assertEq(observer.balanceAtFirstHook(), 3);
        assertEq(observer.lastOwnerAtFirstHook(), address(observer));
        assertEq(observer.supplyAtFirstHook(), 3);
    }
}
