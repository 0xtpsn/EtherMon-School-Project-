const hre = require("hardhat");

async function main() {
    console.log("🚀 Deploying PokéChain contracts...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
    console.log("");

    // Deploy PokechainNFT
    console.log("1️⃣  Deploying PokechainNFT...");
    const PokechainNFT = await hre.ethers.getContractFactory("PokechainNFT");
    const pokechainNFT = await PokechainNFT.deploy();
    await pokechainNFT.waitForDeployment();
    const nftAddress = await pokechainNFT.getAddress();
    console.log("   ✅ PokechainNFT deployed to:", nftAddress);

    // Deploy PokechainMarketplace
    console.log("\n2️⃣  Deploying PokechainMarketplace...");
    const PokechainMarketplace = await hre.ethers.getContractFactory("PokechainMarketplace");
    const marketplace = await PokechainMarketplace.deploy(nftAddress);
    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();
    console.log("   ✅ PokechainMarketplace deployed to:", marketplaceAddress);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📋 DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log(`PokechainNFT:         ${nftAddress}`);
    console.log(`PokechainMarketplace: ${marketplaceAddress}`);
    console.log("=".repeat(50));

    // Verify settings
    console.log("\n🔍 Verifying deployment...");
    console.log("   NFT Name:", await pokechainNFT.name());
    console.log("   NFT Symbol:", await pokechainNFT.symbol());
    console.log("   Max Supply:", (await pokechainNFT.MAX_SUPPLY()).toString());
    console.log("   Mint Price:", hre.ethers.formatEther(await pokechainNFT.MINT_PRICE()), "ETH");
    console.log("   Sale Active:", await pokechainNFT.saleActive());
    console.log("   Marketplace NFT Contract:", await marketplace.nftContract());
    console.log("   Platform Fee:", (await marketplace.platformFeeBps()).toString(), "bps (",
        Number(await marketplace.platformFeeBps()) / 100, "%)");

    console.log("\n✨ Deployment complete!");
    console.log("\n📝 Next steps:");
    console.log("   1. Run: await pokechainNFT.toggleSale() to enable minting");
    console.log("   2. Users can mint with: await pokechainNFT.mint(quantity, { value: ... })");
    console.log("   3. Approve marketplace: await pokechainNFT.setApprovalForAll(marketplaceAddress, true)");
    console.log("   4. List NFTs: await marketplace.listItem(tokenId, price)");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
