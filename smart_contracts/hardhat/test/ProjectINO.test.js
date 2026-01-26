const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProjectINO", function () {
    let ProjectINO;
    let projectINO;
    let owner;
    let addr1;
    let addr2;

    const BASE_URI = "https://example.com/metadata/";
    const UNREVEALED_URI = "https://example.com/unrevealed.json";

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        ProjectINO = await ethers.getContractFactory("ProjectINO");
        projectINO = await ProjectINO.deploy(owner.address, BASE_URI, UNREVEALED_URI);
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await projectINO.name()).to.equal("Project INO");
            expect(await projectINO.symbol()).to.equal("INO");
        });

        it("Should mint reserved tokens to deployer", async function () {
            // RESERVED_INO = 280
            expect(await projectINO.totalSupply()).to.equal(280);
        });

        it("Should start with sale paused", async function () {
            // SaleConfig.PAUSED = 0
            expect(await projectINO.saleConfig()).to.equal(0);
        });

        it("Should set unrevealed URI", async function () {
            expect(await projectINO.unRevealedURI()).to.equal(UNREVEALED_URI);
        });

        it("Should not be revealed initially", async function () {
            expect(await projectINO.revealed()).to.equal(false);
        });
    });

    describe("Token URI", function () {
        it("Should return unrevealed URI when not revealed", async function () {
            expect(await projectINO.tokenURI(0)).to.equal(UNREVEALED_URI);
        });

        it("Should return revealed URI after reveal", async function () {
            await projectINO.reveal();
            expect(await projectINO.tokenURI(0)).to.equal(BASE_URI + "0.json");
        });
    });

    describe("Owner Functions", function () {
        it("Should allow owner to reveal", async function () {
            await projectINO.reveal();
            expect(await projectINO.revealed()).to.equal(true);
        });

        it("Should allow owner to set sale config", async function () {
            await projectINO.setSaleConfig(1); // INOLIST
            expect(await projectINO.saleConfig()).to.equal(1);
        });

        it("Should allow owner to set merkle root", async function () {
            const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test"));
            await projectINO.setMerkleRoots(merkleRoot);
            expect(await projectINO.merkleRoot()).to.equal(merkleRoot);
        });

        it("Should not allow non-owner to reveal", async function () {
            await expect(projectINO.connect(addr1).reveal())
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Minting", function () {
        it("Should not allow minting when paused", async function () {
            await expect(projectINO.connect(addr1).finalMint(1))
                .to.be.revertedWith("ENTRY OF PLANET IS NOT ALLOWED. PLEASE HOLD.");
        });

        it("Should allow minting during final sale", async function () {
            await projectINO.setSaleConfig(2); // FINAL
            await projectINO.connect(addr1).finalMint(1);
            expect(await projectINO.totalSupply()).to.equal(281); // 280 reserved + 1
        });

        it("Should not allow minting more than limit", async function () {
            await projectINO.setSaleConfig(2); // FINAL
            await expect(projectINO.connect(addr1).finalMint(2))
                .to.be.revertedWith("QUANTITY SURPASSES PER-TXN LIMIT");
        });
    });

    describe("Number Minted Tracking", function () {
        it("Should track number minted correctly", async function () {
            expect(await projectINO.numberMinted(owner.address)).to.equal(280);
        });
    });
});
