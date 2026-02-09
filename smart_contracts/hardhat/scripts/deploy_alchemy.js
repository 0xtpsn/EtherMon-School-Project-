// very self explanatory, just deploys contract using Alchemy API on Sepolia testnet

async function launchNFT() {
    const nftContract = await ethers.getContractFactory("PokechainNFT");
    const pokechain_nft = await nftContract.deploy();
    await pokechain_nft.waitForDeployment();   // wait for block to be validated
    console.log("NFT contract deployed to address: ", pokechain_nft.target);
    return pokechain_nft.target
}

async function launchMarketplace(nftContractAddress) {
    const marketplaceContract = await ethers.getContractFactory("PokechainMarketplace");
    const pokechain_marketplace = await marketplaceContract.deploy(nftContractAddress);
    await pokechain_marketplace.waitForDeployment();   // wait for block to be validated
    console.log("Marketplace contract deployed to address: ", pokechain_marketplace.target);
}

async function main() {
    const nftContractAddress = await launchNFT();
    await launchMarketplace(nftContractAddress);
}
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
