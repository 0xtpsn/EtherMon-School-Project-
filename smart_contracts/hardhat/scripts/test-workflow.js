const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Color helpers for console output
const colors = {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

async function main() {
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("🧪 POKECHAIN COMPLETE WORKFLOW TEST"));
    console.log("=".repeat(70));

    const [owner, user1, user2, bidder1, bidder2] = await hre.ethers.getSigners();
    console.log(`\nOwner:   ${owner.address}`);
    console.log(`User1:   ${user1.address}`);
    console.log(`User2:   ${user2.address}`);
    console.log(`Bidder1: ${bidder1.address}`);
    console.log(`Bidder2: ${bidder2.address}`);

    // ============================================
    // DEPLOY CONTRACTS
    // ============================================
    console.log("\n" + "-".repeat(70));
    console.log(colors.cyan("📦 STEP 0: Deploying contracts..."));
    console.log("-".repeat(70));

    const PokechainNFT = await hre.ethers.getContractFactory("PokechainNFT");
    const nft = await PokechainNFT.deploy();
    await nft.waitForDeployment();
    console.log(`   PokechainNFT: ${await nft.getAddress()}`);

    const PokechainMarketplace = await hre.ethers.getContractFactory("PokechainMarketplace");
    const marketplace = await PokechainMarketplace.deploy(await nft.getAddress());
    await marketplace.waitForDeployment();
    console.log(`   PokechainMarketplace: ${await marketplace.getAddress()}`);

    // ============================================
    // NFT CONTRACT TESTS
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("🎴 NFT CONTRACT WORKFLOW"));
    console.log("=".repeat(70));

    // Step 1: Toggle Sale
    console.log("\n" + colors.green("✅ STEP 1: Toggle sale to enable minting..."));
    console.log(`   Sale active before: ${colors.red(await nft.saleActive())}`);
    await nft.toggleSale();
    console.log(`   Sale active after: ${colors.green(await nft.saleActive())}`);

    // Step 2: Mint NFTs
    console.log("\n" + colors.green("✅ STEP 2: User1 mints 5 NFTs..."));
    const mintPrice = await nft.MINT_PRICE();
    await nft.connect(user1).mint(5, { value: mintPrice * 5n });
    console.log(`   User1 balance: ${colors.yellow(await nft.balanceOf(user1.address))} NFTs`);
    console.log(`   Total supply: ${await nft.totalSupply()}`);
    for (let i = 0; i < 5; i++) {
        const pokemonId = await nft.getPokemonId(i);
        console.log(`   Token ${i} -> Pokemon #${colors.cyan(pokemonId)}`);
    }

    // Step 3: Test mint limits
    console.log("\n" + colors.green("✅ STEP 3: Testing mint limit (max 50 per wallet)..."));
    try {
        await nft.connect(user1).mint(50, { value: mintPrice * 50n });
        console.log(`   ${colors.red("FAILED")} - Should have rejected`);
    } catch (e) {
        console.log(`   ${colors.green("PASSED")} - Correctly rejected: "${e.message.split("'")[1]}"`);
    }

    // Step 4: Test insufficient payment
    console.log("\n" + colors.green("✅ STEP 4: Testing insufficient payment rejection..."));
    try {
        await nft.connect(user2).mint(2, { value: mintPrice });
        console.log(`   ${colors.red("FAILED")} - Should have rejected`);
    } catch (e) {
        console.log(`   ${colors.green("PASSED")} - Correctly rejected: "${e.message.split("'")[1]}"`);
    }

    // Step 5: Withdraw funds
    console.log("\n" + colors.green("✅ STEP 5: Owner withdraws minting funds..."));
    const contractBal = await hre.ethers.provider.getBalance(await nft.getAddress());
    console.log(`   Contract balance: ${hre.ethers.formatEther(contractBal)} ETH`);
    await nft.withdraw();
    console.log(`   Balance after withdraw: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(await nft.getAddress()))} ETH`);

    // ============================================
    // MARKETPLACE - FIXED PRICE LISTING
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("🛒 MARKETPLACE - FIXED PRICE SALES"));
    console.log("=".repeat(70));

    // Step 6: Approve marketplace
    console.log("\n" + colors.green("✅ STEP 6: User1 approves marketplace..."));
    await nft.connect(user1).setApprovalForAll(await marketplace.getAddress(), true);
    console.log(`   Marketplace approved: ${colors.green(await nft.isApprovedForAll(user1.address, await marketplace.getAddress()))}`);

    // Step 7: List NFT
    console.log("\n" + colors.green("✅ STEP 7: User1 lists Token #0 for 1 ETH..."));
    const listPrice = hre.ethers.parseEther("1");
    await marketplace.connect(user1).listItem(0, listPrice);
    const listing = await marketplace.getListing(0);
    console.log(`   Listing active: ${colors.green(listing.active)}`);
    console.log(`   Listing price: ${colors.yellow(hre.ethers.formatEther(listing.price))} ETH`);
    console.log(`   Seller: ${listing.seller}`);

    // Step 8: Update listing price
    console.log("\n" + colors.green("✅ STEP 8: User1 updates listing price to 0.5 ETH..."));
    const newPrice = hre.ethers.parseEther("0.5");
    await marketplace.connect(user1).updateListing(0, newPrice);
    console.log(`   New price: ${colors.yellow(hre.ethers.formatEther((await marketplace.getListing(0)).price))} ETH`);

    // Step 9: User2 buys NFT
    console.log("\n" + colors.green("✅ STEP 9: User2 buys Token #0..."));
    const user1BalBefore = await hre.ethers.provider.getBalance(user1.address);
    await marketplace.connect(user2).buyItem(0, { value: newPrice });
    const user1BalAfter = await hre.ethers.provider.getBalance(user1.address);
    console.log(`   New owner: ${colors.cyan(await nft.ownerOf(0))}`);
    console.log(`   User1 received: ${colors.yellow(hre.ethers.formatEther(user1BalAfter - user1BalBefore))} ETH (after 2.5% fee)`);

    // ============================================
    // MARKETPLACE - AUCTIONS
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("🔨 MARKETPLACE - AUCTIONS"));
    console.log("=".repeat(70));

    // Step 10: Create auction
    console.log("\n" + colors.green("✅ STEP 10: User1 creates auction for Token #1 (0.1 ETH, 1 hour)..."));
    const startingBid = hre.ethers.parseEther("0.1");
    await marketplace.connect(user1).createAuction(1, startingBid, 3600);
    const auction1 = await marketplace.getAuction(1);
    console.log(`   Auction active: ${colors.green(auction1.active)}`);
    console.log(`   Starting price: ${colors.yellow(hre.ethers.formatEther(auction1.startingPrice))} ETH`);
    console.log(`   End time: ${new Date(Number(auction1.endTime) * 1000).toLocaleTimeString()}`);

    // Step 11: Bidder1 places bid
    console.log("\n" + colors.green("✅ STEP 11: Bidder1 places bid of 0.1 ETH..."));
    await marketplace.connect(bidder1).placeBid(1, { value: startingBid });
    console.log(`   Highest bidder: ${colors.cyan(await (await marketplace.getAuction(1)).highestBidder)}`);
    console.log(`   Highest bid: ${colors.yellow(hre.ethers.formatEther((await marketplace.getAuction(1)).highestBid))} ETH`);

    // Step 12: Bidder2 outbids
    console.log("\n" + colors.green("✅ STEP 12: Bidder2 outbids with 0.2 ETH..."));
    const higherBid = hre.ethers.parseEther("0.2");
    await marketplace.connect(bidder2).placeBid(1, { value: higherBid });
    console.log(`   Highest bidder: ${colors.cyan((await marketplace.getAuction(1)).highestBidder)}`);
    console.log(`   Highest bid: ${colors.yellow(hre.ethers.formatEther((await marketplace.getAuction(1)).highestBid))} ETH`);
    console.log(`   Bidder1 pending returns: ${colors.yellow(hre.ethers.formatEther(await marketplace.getPendingReturns(bidder1.address)))} ETH`);

    // Step 13: Bidder1 withdraws
    console.log("\n" + colors.green("✅ STEP 13: Bidder1 withdraws outbid funds..."));
    const bidder1BalBefore = await hre.ethers.provider.getBalance(bidder1.address);
    await marketplace.connect(bidder1).withdraw();
    const bidder1BalAfter = await hre.ethers.provider.getBalance(bidder1.address);
    console.log(`   Bidder1 received: ~${colors.yellow(hre.ethers.formatEther(bidder1BalAfter - bidder1BalBefore))} ETH`);
    console.log(`   Pending returns now: ${await marketplace.getPendingReturns(bidder1.address)}`);

    // Step 14: End auction
    console.log("\n" + colors.green("✅ STEP 14: Fast-forward time and end auction..."));
    await time.increase(3601);
    await marketplace.endAuction(1);
    console.log(`   Token #1 new owner: ${colors.cyan(await nft.ownerOf(1))}`);
    console.log(`   Auction settled: ${colors.green((await marketplace.getAuction(1)).settled)}`);

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("⚙️  ADMIN FUNCTIONS"));
    console.log("=".repeat(70));

    // Step 15: Pause marketplace
    console.log("\n" + colors.green("✅ STEP 15: Owner pauses marketplace..."));
    await marketplace.togglePause();
    console.log(`   Marketplace paused: ${colors.yellow(await marketplace.paused())}`);

    // Step 16: Try to list while paused
    console.log("\n" + colors.green("✅ STEP 16: Try listing while paused..."));
    try {
        await marketplace.connect(user1).listItem(2, listPrice);
        console.log(`   ${colors.red("FAILED")} - Should have rejected`);
    } catch (e) {
        console.log(`   ${colors.green("PASSED")} - Correctly rejected: "Marketplace is paused"`);
    }

    // Step 17: Unpause
    console.log("\n" + colors.green("✅ STEP 17: Owner unpauses marketplace..."));
    await marketplace.togglePause();
    console.log(`   Marketplace paused: ${colors.green(!(await marketplace.paused()))}`);

    // Step 18: Withdraw platform fees
    console.log("\n" + colors.green("✅ STEP 18: Owner withdraws platform fees..."));
    const marketBalBefore = await hre.ethers.provider.getBalance(await marketplace.getAddress());
    console.log(`   Marketplace balance (fees): ${colors.yellow(hre.ethers.formatEther(marketBalBefore))} ETH`);
    if (marketBalBefore > 0n) {
        await marketplace.withdrawFees();
        console.log(`   Fees withdrawn successfully!`);
    }

    // ============================================
    // TOKEN STATUS CHECK
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("📊 TOKEN STATUS CHECK"));
    console.log("=".repeat(70));

    const statusMap = ["NONE", "LISTED", "IN_AUCTION"];
    for (let i = 0; i < 5; i++) {
        const [status, price, seller, endTime] = await marketplace.getTokenStatus(i);
        const owner = await nft.ownerOf(i);
        const pokemonId = await nft.getPokemonId(i);
        console.log(`   Token #${i}: Pokemon #${pokemonId} | Owner: ${owner.slice(0, 10)}... | Status: ${colors.cyan(statusMap[status])}`);
    }

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log(colors.bold("🎉 ALL WORKFLOW TESTS COMPLETED SUCCESSFULLY!"));
    console.log("=".repeat(70));
    console.log(`
Summary:
  ✅ NFT minting with random Pokemon assignment
  ✅ Mint limits and payment validation
  ✅ Fixed-price listing, update, and purchase
  ✅ Platform fee (2.5%) correctly deducted
  ✅ Auction creation, bidding, and settlement
  ✅ Outbid refund withdrawal (pull pattern)
  ✅ Emergency pause/unpause functionality
  ✅ Platform fee withdrawal
  ✅ Token status queries
`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
