const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PokechainNFT", function () {
    let PokechainNFT;
    let pokechainNFT;
    let owner;
    let addr1;
    let addr2;

    const MINT_PRICE = ethers.parseEther("0.01");
    const MAX_SUPPLY = 1025;
    const MAX_PER_WALLET = 50;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        PokechainNFT = await ethers.getContractFactory("PokechainNFT");
        pokechainNFT = await PokechainNFT.deploy();
        await pokechainNFT.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await pokechainNFT.name()).to.equal("Pokechain Collection");
            expect(await pokechainNFT.symbol()).to.equal("POKE");
        });

        it("Should start with sale inactive", async function () {
            expect(await pokechainNFT.saleActive()).to.equal(false);
        });

        it("Should have correct constants", async function () {
            expect(await pokechainNFT.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
            expect(await pokechainNFT.MINT_PRICE()).to.equal(MINT_PRICE);
            expect(await pokechainNFT.MAX_PER_WALLET()).to.equal(MAX_PER_WALLET);
        });

        it("Should have correct base URI", async function () {
            // Enable sale and mint one to test URI
            await pokechainNFT.toggleSale();
            await pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE });

            const tokenURI = await pokechainNFT.tokenURI(0);
            expect(tokenURI).to.include("https://bafybeienzjyalm2axjk3gx75mcrbjjjv2ej3j5guoaeddjifgryheut57m.ipfs.dweb.link/");
            expect(tokenURI).to.include(".json");
        });
    });

    describe("Sale Toggle", function () {
        it("Should allow owner to toggle sale", async function () {
            expect(await pokechainNFT.saleActive()).to.equal(false);

            await pokechainNFT.toggleSale();
            expect(await pokechainNFT.saleActive()).to.equal(true);

            await pokechainNFT.toggleSale();
            expect(await pokechainNFT.saleActive()).to.equal(false);
        });

        it("Should emit SaleToggled event", async function () {
            await expect(pokechainNFT.toggleSale())
                .to.emit(pokechainNFT, "SaleToggled")
                .withArgs(true);
        });

        it("Should not allow non-owner to toggle sale", async function () {
            await expect(pokechainNFT.connect(addr1).toggleSale())
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Minting", function () {
        beforeEach(async function () {
            await pokechainNFT.toggleSale();
        });

        it("Should not allow minting when sale is inactive", async function () {
            await pokechainNFT.toggleSale(); // Turn off
            await expect(pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE }))
                .to.be.revertedWith("Sale is not active");
        });

        it("Should allow minting when sale is active", async function () {
            await pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE });
            expect(await pokechainNFT.totalSupply()).to.equal(1);
            expect(await pokechainNFT.balanceOf(addr1.address)).to.equal(1);
        });

        it("Should mint multiple NFTs in one transaction", async function () {
            await pokechainNFT.connect(addr1).mint(5, { value: MINT_PRICE * 5n });
            expect(await pokechainNFT.totalSupply()).to.equal(5);
            expect(await pokechainNFT.balanceOf(addr1.address)).to.equal(5);
        });

        it("Should assign random Pokemon IDs on mint", async function () {
            await pokechainNFT.connect(addr1).mint(3, { value: MINT_PRICE * 3n });

            const pokemon1 = await pokechainNFT.getPokemonId(0);
            const pokemon2 = await pokechainNFT.getPokemonId(1);
            const pokemon3 = await pokechainNFT.getPokemonId(2);

            // Pokemon IDs should be between 1 and 1025
            expect(pokemon1).to.be.gte(1);
            expect(pokemon1).to.be.lte(1025);
            expect(pokemon2).to.be.gte(1);
            expect(pokemon2).to.be.lte(1025);
            expect(pokemon3).to.be.gte(1);
            expect(pokemon3).to.be.lte(1025);
        });

        it("Should emit Minted event with Pokemon ID", async function () {
            const tx = await pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE });
            const receipt = await tx.wait();

            // Check that Minted event was emitted
            const mintedEvent = receipt.logs.find(log => {
                try {
                    return pokechainNFT.interface.parseLog(log)?.name === "Minted";
                } catch { return false; }
            });
            expect(mintedEvent).to.not.be.undefined;
        });

        it("Should reject zero quantity", async function () {
            await expect(pokechainNFT.connect(addr1).mint(0, { value: MINT_PRICE }))
                .to.be.revertedWith("Quantity must be greater than 0");
        });

        it("Should reject insufficient payment", async function () {
            await expect(pokechainNFT.connect(addr1).mint(2, { value: MINT_PRICE }))
                .to.be.revertedWith("Insufficient payment");
        });

        it("Should refund excess payment", async function () {
            const excessAmount = ethers.parseEther("0.05");
            const balanceBefore = await ethers.provider.getBalance(addr1.address);

            const tx = await pokechainNFT.connect(addr1).mint(1, { value: excessAmount });
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const balanceAfter = await ethers.provider.getBalance(addr1.address);
            const expectedBalance = balanceBefore - MINT_PRICE - gasUsed;

            // Should have refunded the excess (0.04 ETH)
            expect(balanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
        });

        it("Should enforce max per wallet limit", async function () {
            // Mint max allowed
            await pokechainNFT.connect(addr1).mint(50, { value: MINT_PRICE * 50n });

            // Try to mint one more
            await expect(pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE }))
                .to.be.revertedWith("Exceeds wallet limit of 50");
        });

        it("Should track wallet minted count", async function () {
            await pokechainNFT.connect(addr1).mint(5, { value: MINT_PRICE * 5n });
            expect(await pokechainNFT.walletMinted(addr1.address)).to.equal(5);
        });

        it("Should reject minting that exceeds max supply", async function () {
            // This test simulates exceeding max supply
            // We can't mint 1025 in a test easily, but we can verify the check works
            // by trying to mint more than remaining
            // First, we need a scenario where supply is near max
            // For now, test that minting totalSupply + quantity > MAX_SUPPLY fails logically
            const toMint = MAX_SUPPLY + 1;
            await expect(pokechainNFT.connect(addr1).mint(toMint, { value: MINT_PRICE * BigInt(toMint) }))
                .to.be.revertedWith("Exceeds max supply");
        });
    });

    describe("Token URI", function () {
        beforeEach(async function () {
            await pokechainNFT.toggleSale();
            await pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE });
        });

        it("Should return correct token URI format", async function () {
            const pokemonId = await pokechainNFT.getPokemonId(0);
            const tokenURI = await pokechainNFT.tokenURI(0);

            expect(tokenURI).to.equal(
                `https://bafybeienzjyalm2axjk3gx75mcrbjjjv2ej3j5guoaeddjifgryheut57m.ipfs.dweb.link/${pokemonId}.json`
            );
        });

        it("Should revert for non-existent token", async function () {
            await expect(pokechainNFT.tokenURI(999))
                .to.be.revertedWith("ERC721Metadata: URI query for nonexistent token");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to update base URI", async function () {
            const newURI = "https://newuri.com/";
            await pokechainNFT.setBaseURI(newURI);

            // Mint and check URI
            await pokechainNFT.toggleSale();
            await pokechainNFT.connect(addr1).mint(1, { value: MINT_PRICE });

            const tokenURI = await pokechainNFT.tokenURI(0);
            expect(tokenURI).to.include(newURI);
        });

        it("Should emit BaseURIUpdated event", async function () {
            const newURI = "https://newuri.com/";
            await expect(pokechainNFT.setBaseURI(newURI))
                .to.emit(pokechainNFT, "BaseURIUpdated")
                .withArgs(newURI);
        });

        it("Should allow owner to update base extension", async function () {
            await pokechainNFT.setBaseExtension(".metadata");
            expect(await pokechainNFT.baseExtension()).to.equal(".metadata");
        });

        it("Should not allow non-owner to update base URI", async function () {
            await expect(pokechainNFT.connect(addr1).setBaseURI("https://hack.com/"))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Withdraw", function () {
        beforeEach(async function () {
            await pokechainNFT.toggleSale();
            await pokechainNFT.connect(addr1).mint(10, { value: MINT_PRICE * 10n });
        });

        it("Should allow owner to withdraw funds", async function () {
            const contractBalance = await ethers.provider.getBalance(await pokechainNFT.getAddress());
            expect(contractBalance).to.equal(MINT_PRICE * 10n);

            const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
            const tx = await pokechainNFT.withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + contractBalance - gasUsed);
        });

        it("Should emit Withdrawn event", async function () {
            const contractBalance = await ethers.provider.getBalance(await pokechainNFT.getAddress());
            await expect(pokechainNFT.withdraw())
                .to.emit(pokechainNFT, "Withdrawn")
                .withArgs(owner.address, contractBalance);
        });

        it("Should revert if no funds to withdraw", async function () {
            await pokechainNFT.withdraw(); // Withdraw all
            await expect(pokechainNFT.withdraw())
                .to.be.revertedWith("No funds to withdraw");
        });

        it("Should not allow non-owner to withdraw", async function () {
            await expect(pokechainNFT.connect(addr1).withdraw())
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await pokechainNFT.toggleSale();
            await pokechainNFT.connect(addr1).mint(5, { value: MINT_PRICE * 5n });
        });

        it("Should return correct remaining supply", async function () {
            expect(await pokechainNFT.remainingSupply()).to.equal(MAX_SUPPLY - 5);
        });

        it("Should return correct sale status", async function () {
            expect(await pokechainNFT.isSaleActive()).to.equal(true);
            await pokechainNFT.toggleSale();
            expect(await pokechainNFT.isSaleActive()).to.equal(false);
        });

        it("Should return Pokemon ID for token", async function () {
            const pokemonId = await pokechainNFT.getPokemonId(0);
            expect(pokemonId).to.be.gte(1);
            expect(pokemonId).to.be.lte(1025);
        });

        it("Should revert getPokemonId for non-existent token", async function () {
            await expect(pokechainNFT.getPokemonId(999))
                .to.be.revertedWith("Token does not exist");
        });
    });
});
