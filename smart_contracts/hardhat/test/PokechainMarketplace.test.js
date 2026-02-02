const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PokechainMarketplace", function () {
    let PokechainNFT, pokechainNFT;
    let PokechainMarketplace, marketplace;
    let owner, seller, buyer, bidder1, bidder2, feeRecipient;

    const MINT_PRICE = ethers.parseEther("0.01");
    const LISTING_PRICE = ethers.parseEther("1");
    const STARTING_BID = ethers.parseEther("0.5");
    const ONE_HOUR = 3600;
    const ONE_DAY = 86400;

    beforeEach(async function () {
        [owner, seller, buyer, bidder1, bidder2, feeRecipient] = await ethers.getSigners();

        // Deploy NFT contract
        PokechainNFT = await ethers.getContractFactory("PokechainNFT");
        pokechainNFT = await PokechainNFT.deploy();
        await pokechainNFT.waitForDeployment();

        // Deploy Marketplace with fee recipient
        PokechainMarketplace = await ethers.getContractFactory("PokechainMarketplace");
        marketplace = await PokechainMarketplace.deploy(await pokechainNFT.getAddress(), feeRecipient.address);
        await marketplace.waitForDeployment();

        // Enable sale and mint NFTs to seller
        await pokechainNFT.toggleSale();
        await pokechainNFT.connect(seller).mint(5, { value: MINT_PRICE * 5n });

        // Approve marketplace for all seller's NFTs
        await pokechainNFT.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    });

    describe("Deployment", function () {
        it("Should set the correct NFT contract", async function () {
            expect(await marketplace.nftContract()).to.equal(await pokechainNFT.getAddress());
        });

        it("Should have default platform fee of 2.5%", async function () {
            expect(await marketplace.platformFeeBps()).to.equal(250);
        });

        it("Should start unpaused", async function () {
            expect(await marketplace.paused()).to.equal(false);
        });

        it("Should set the correct fee recipient", async function () {
            expect(await marketplace.feeRecipient()).to.equal(feeRecipient.address);
        });
    });

    describe("Fixed-Price Listings", function () {
        describe("listItem", function () {
            it("Should list an NFT for sale", async function () {
                await marketplace.connect(seller).listItem(0, LISTING_PRICE);

                const listing = await marketplace.getListing(0);
                expect(listing.seller).to.equal(seller.address);
                expect(listing.price).to.equal(LISTING_PRICE);
                expect(listing.active).to.equal(true);
            });

            it("Should emit ItemListed event", async function () {
                await expect(marketplace.connect(seller).listItem(0, LISTING_PRICE))
                    .to.emit(marketplace, "ItemListed")
                    .withArgs(0, seller.address, LISTING_PRICE);
            });

            it("Should reject if not owner", async function () {
                await expect(marketplace.connect(buyer).listItem(0, LISTING_PRICE))
                    .to.be.revertedWith("Not the owner");
            });

            it("Should reject if price is 0", async function () {
                await expect(marketplace.connect(seller).listItem(0, 0))
                    .to.be.revertedWith("Price must be greater than 0");
            });

            it("Should reject if marketplace not approved", async function () {
                await pokechainNFT.connect(seller).setApprovalForAll(await marketplace.getAddress(), false);
                await expect(marketplace.connect(seller).listItem(0, LISTING_PRICE))
                    .to.be.revertedWith("Marketplace not approved");
            });

            it("Should reject if already listed", async function () {
                await marketplace.connect(seller).listItem(0, LISTING_PRICE);
                await expect(marketplace.connect(seller).listItem(0, LISTING_PRICE))
                    .to.be.revertedWith("Already listed for sale");
            });
        });

        describe("cancelListing", function () {
            beforeEach(async function () {
                await marketplace.connect(seller).listItem(0, LISTING_PRICE);
            });

            it("Should cancel a listing", async function () {
                await marketplace.connect(seller).cancelListing(0);
                expect(await marketplace.isListed(0)).to.equal(false);
            });

            it("Should emit ListingCancelled event", async function () {
                await expect(marketplace.connect(seller).cancelListing(0))
                    .to.emit(marketplace, "ListingCancelled")
                    .withArgs(0);
            });

            it("Should reject if not the seller", async function () {
                await expect(marketplace.connect(buyer).cancelListing(0))
                    .to.be.revertedWith("Not the seller");
            });
        });

        describe("updateListing", function () {
            beforeEach(async function () {
                await marketplace.connect(seller).listItem(0, LISTING_PRICE);
            });

            it("Should update listing price", async function () {
                const newPrice = ethers.parseEther("2");
                await marketplace.connect(seller).updateListing(0, newPrice);

                const listing = await marketplace.getListing(0);
                expect(listing.price).to.equal(newPrice);
            });

            it("Should emit ListingUpdated event", async function () {
                const newPrice = ethers.parseEther("2");
                await expect(marketplace.connect(seller).updateListing(0, newPrice))
                    .to.emit(marketplace, "ListingUpdated")
                    .withArgs(0, newPrice);
            });
        });

        describe("buyItem", function () {
            beforeEach(async function () {
                await marketplace.connect(seller).listItem(0, LISTING_PRICE);
            });

            it("Should allow buying a listed NFT", async function () {
                await marketplace.connect(buyer).buyItem(0, { value: LISTING_PRICE });

                expect(await pokechainNFT.ownerOf(0)).to.equal(buyer.address);
                expect(await marketplace.isListed(0)).to.equal(false);
            });

            it("Should transfer correct amounts and auto-send 2.5% fee", async function () {
                const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
                const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);

                await marketplace.connect(buyer).buyItem(0, { value: LISTING_PRICE });

                const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
                const feeRecipientBalanceAfter = await ethers.provider.getBalance(feeRecipient.address);
                const fee = LISTING_PRICE * 250n / 10000n; // 2.5%
                const expectedProceeds = LISTING_PRICE - fee;

                expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedProceeds);
                expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(fee);
            });

            it("Should emit ItemSold event", async function () {
                await expect(marketplace.connect(buyer).buyItem(0, { value: LISTING_PRICE }))
                    .to.emit(marketplace, "ItemSold")
                    .withArgs(0, seller.address, buyer.address, LISTING_PRICE);
            });

            it("Should refund excess payment", async function () {
                const excessAmount = LISTING_PRICE * 2n;
                const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

                const tx = await marketplace.connect(buyer).buyItem(0, { value: excessAmount });
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed * receipt.gasPrice;

                const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
                const expectedBalance = buyerBalanceBefore - LISTING_PRICE - gasUsed;

                expect(buyerBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
            });

            it("Should reject insufficient payment", async function () {
                await expect(marketplace.connect(buyer).buyItem(0, { value: LISTING_PRICE / 2n }))
                    .to.be.revertedWith("Insufficient payment");
            });
        });
    });

    describe("Auctions", function () {
        describe("createAuction", function () {
            it("Should create an auction", async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);

                const auction = await marketplace.getAuction(0);
                expect(auction.seller).to.equal(seller.address);
                expect(auction.startingPrice).to.equal(STARTING_BID);
                expect(auction.active).to.equal(true);
            });

            it("Should emit AuctionCreated event", async function () {
                await expect(marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY))
                    .to.emit(marketplace, "AuctionCreated");
            });

            it("Should reject duration less than 1 hour", async function () {
                await expect(marketplace.connect(seller).createAuction(0, STARTING_BID, 1800))
                    .to.be.revertedWith("Duration must be at least 1 hour");
            });

            it("Should reject duration more than 7 days", async function () {
                await expect(marketplace.connect(seller).createAuction(0, STARTING_BID, 8 * ONE_DAY))
                    .to.be.revertedWith("Duration must be at most 7 days");
            });
        });

        describe("placeBid", function () {
            beforeEach(async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);
            });

            it("Should place a valid bid", async function () {
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });

                const auction = await marketplace.getAuction(0);
                expect(auction.highestBid).to.equal(STARTING_BID);
                expect(auction.highestBidder).to.equal(bidder1.address);
            });

            it("Should emit BidPlaced event", async function () {
                await expect(marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID }))
                    .to.emit(marketplace, "BidPlaced")
                    .withArgs(0, bidder1.address, STARTING_BID);
            });

            it("Should allow higher bid to outbid", async function () {
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });

                const higherBid = STARTING_BID + ethers.parseEther("0.1");
                await marketplace.connect(bidder2).placeBid(0, { value: higherBid });

                const auction = await marketplace.getAuction(0);
                expect(auction.highestBidder).to.equal(bidder2.address);
            });

            it("Should add pending returns for outbid bidder", async function () {
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });

                const higherBid = STARTING_BID + ethers.parseEther("0.1");
                await marketplace.connect(bidder2).placeBid(0, { value: higherBid });

                expect(await marketplace.getPendingReturns(bidder1.address)).to.equal(STARTING_BID);
            });

            it("Should reject bid below starting price", async function () {
                await expect(marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID / 2n }))
                    .to.be.revertedWith("Bid below starting price");
            });

            it("Should reject bid not higher than current", async function () {
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });
                await expect(marketplace.connect(bidder2).placeBid(0, { value: STARTING_BID }))
                    .to.be.revertedWith("Bid must exceed current highest");
            });

            it("Should reject seller bidding", async function () {
                await expect(marketplace.connect(seller).placeBid(0, { value: STARTING_BID }))
                    .to.be.revertedWith("Seller cannot bid");
            });

            it("Should reject bid after auction has ended", async function () {
                // Fast forward past auction end time
                await time.increase(ONE_DAY + 1);

                await expect(marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID }))
                    .to.be.revertedWith("Auction has ended");
            });
        });

        describe("endAuction", function () {
            beforeEach(async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_HOUR);
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });
            });

            it("Should end auction and transfer NFT to winner", async function () {
                await time.increase(ONE_HOUR + 1);
                await marketplace.endAuction(0);

                expect(await pokechainNFT.ownerOf(0)).to.equal(bidder1.address);
            });

            it("Should transfer proceeds to seller and auto-send fee", async function () {
                const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
                const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);

                await time.increase(ONE_HOUR + 1);
                await marketplace.endAuction(0);

                const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
                const feeRecipientBalanceAfter = await ethers.provider.getBalance(feeRecipient.address);
                const fee = STARTING_BID * 250n / 10000n;
                const expectedProceeds = STARTING_BID - fee;

                expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedProceeds);
                expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(fee);
            });

            it("Should emit AuctionEnded event", async function () {
                await time.increase(ONE_HOUR + 1);
                await expect(marketplace.endAuction(0))
                    .to.emit(marketplace, "AuctionEnded")
                    .withArgs(0, bidder1.address, STARTING_BID);
            });

            it("Should reject ending before time", async function () {
                await expect(marketplace.endAuction(0))
                    .to.be.revertedWith("Auction not yet ended");
            });
        });

        describe("cancelAuction", function () {
            it("Should allow cancelling auction with no bids", async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);
                await marketplace.connect(seller).cancelAuction(0);

                expect(await marketplace.isInAuction(0)).to.equal(false);
            });

            it("Should reject cancelling auction with bids", async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });

                await expect(marketplace.connect(seller).cancelAuction(0))
                    .to.be.revertedWith("Cannot cancel with bids");
            });
        });

        describe("withdraw", function () {
            it("Should allow outbid user to withdraw", async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });

                const higherBid = STARTING_BID + ethers.parseEther("0.1");
                await marketplace.connect(bidder2).placeBid(0, { value: higherBid });

                const balanceBefore = await ethers.provider.getBalance(bidder1.address);
                const tx = await marketplace.connect(bidder1).withdraw();
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed * receipt.gasPrice;
                const balanceAfter = await ethers.provider.getBalance(bidder1.address);

                expect(balanceAfter - balanceBefore + gasUsed).to.equal(STARTING_BID);
            });

            it("Should emit FundsWithdrawn event", async function () {
                await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);
                await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });
                await marketplace.connect(bidder2).placeBid(0, { value: STARTING_BID + ethers.parseEther("0.1") });

                await expect(marketplace.connect(bidder1).withdraw())
                    .to.emit(marketplace, "FundsWithdrawn")
                    .withArgs(bidder1.address, STARTING_BID);
            });

            it("Should reject if no pending returns", async function () {
                await expect(marketplace.connect(bidder1).withdraw())
                    .to.be.revertedWith("No funds to withdraw");
            });
        });


        describe("Contract Balance Protection", function () {
            it("Contract balance should only hold auction bids, not fees", async function () {
                await marketplace.connect(seller).createAuction(1, STARTING_BID, ONE_DAY);

                const bidAmt = ethers.parseEther("10");
                await marketplace.connect(bidder1).placeBid(1, { value: bidAmt });

                // Contract should hold exactly the bid amount (no fees accumulating)
                const contractBalance = await ethers.provider.getBalance(marketplace.target);
                expect(contractBalance).to.equal(bidAmt);
            });

            it("Fees should be sent immediately on sale", async function () {
                const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipient.address);

                await marketplace.connect(seller).listItem(0, LISTING_PRICE);
                await marketplace.connect(buyer).buyItem(0, { value: LISTING_PRICE });

                const feeRecipientBalanceAfter = await ethers.provider.getBalance(feeRecipient.address);
                const fee = LISTING_PRICE * 250n / 10000n;

                expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(fee);
                // Contract should have 0 balance (no fees left behind)
                expect(await ethers.provider.getBalance(marketplace.target)).to.equal(0);
            });
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to pause marketplace", async function () {
            await marketplace.togglePause();
            expect(await marketplace.paused()).to.equal(true);
        });

        it("Should block listings when paused", async function () {
            await marketplace.togglePause();
            await expect(marketplace.connect(seller).listItem(0, LISTING_PRICE))
                .to.be.revertedWith("Marketplace is paused");
        });

        it("Should allow owner to set platform fee", async function () {
            await marketplace.setPlatformFee(500); // 5%
            expect(await marketplace.platformFeeBps()).to.equal(500);
        });

        it("Should reject fee above maximum", async function () {
            await expect(marketplace.setPlatformFee(1500)) // 15%
                .to.be.revertedWith("Fee too high");
        });

        it("Should allow owner to change fee recipient", async function () {
            await marketplace.setFeeRecipient(buyer.address);
            expect(await marketplace.feeRecipient()).to.equal(buyer.address);
        });

        it("Should emit FeeRecipientUpdated event", async function () {
            await expect(marketplace.setFeeRecipient(buyer.address))
                .to.emit(marketplace, "FeeRecipientUpdated")
                .withArgs(buyer.address);
        });

        it("Should reject zero address as fee recipient", async function () {
            await expect(marketplace.setFeeRecipient(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid fee recipient");
        });

        it("Should block auctions when paused", async function () {
            await marketplace.togglePause();
            await expect(marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY))
                .to.be.revertedWith("Marketplace is paused");
        });

        it("Should block bids when paused", async function () {
            await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_DAY);
            await marketplace.togglePause();
            await expect(marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID }))
                .to.be.revertedWith("Marketplace is paused");
        });
    });

    describe("Edge Cases", function () {
        it("Should fail to list after transferring NFT away", async function () {
            // Seller lists NFT
            await marketplace.connect(seller).listItem(0, LISTING_PRICE);

            // Seller transfers the NFT to buyer (breaking the listing)
            await pokechainNFT.connect(seller).transferFrom(seller.address, buyer.address, 0);

            // Buy should fail because seller no longer owns it
            await expect(marketplace.connect(bidder1).buyItem(0, { value: LISTING_PRICE }))
                .to.be.reverted; // Transfer will fail
        });

        it("Should fail to end auction if NFT was transferred", async function () {
            // Create auction
            await marketplace.connect(seller).createAuction(0, STARTING_BID, ONE_HOUR);
            await marketplace.connect(bidder1).placeBid(0, { value: STARTING_BID });

            // Seller revokes approval (simulating transfer scenario)
            await pokechainNFT.connect(seller).setApprovalForAll(await marketplace.getAddress(), false);

            // Fast forward and try to end
            await time.increase(ONE_HOUR + 1);
            await expect(marketplace.endAuction(0))
                .to.be.reverted; // Transfer will fail
        });
    });
});
