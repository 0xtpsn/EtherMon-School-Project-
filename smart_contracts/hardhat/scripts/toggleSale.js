const hre = require("hardhat");

async function main() {
    const NFT_ADDRESS = "0xee3eC5a73D5c2e5D25029bbbbA7dA0496dBd9e1c";

    const [deployer] = await hre.ethers.getSigners();
    console.log("Using account:", deployer.address);

    const PokechainNFT = await hre.ethers.getContractFactory("PokechainNFT");
    const nft = PokechainNFT.attach(NFT_ADDRESS);

    const saleBefore = await nft.saleActive();
    console.log("Sale active before:", saleBefore);

    const tx = await nft.toggleSale();
    await tx.wait();

    const saleAfter = await nft.saleActive();
    console.log("Sale active after:", saleAfter);
    console.log("✅ Done!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
