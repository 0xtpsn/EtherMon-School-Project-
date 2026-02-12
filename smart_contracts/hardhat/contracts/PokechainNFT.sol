// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "./ERC721A/ERC721A.sol";
import "./access/Ownable.sol";
import "./utils/Strings.sol";
import "./utils/ReentrancyGuard.sol";

/**
 * @title PokechainNFT
 * @dev ERC721A NFT contract for Pokechain Collection
 * Features:
 * - Gas-optimized batch minting (ERC721A)
 * - Deterministic Pokemon assignment via hash (no storage writes)
 * - Sale toggle (emergency stop)
 * - ReentrancyGuard on withdraw
 * - Max 50 per wallet
 */
contract PokechainNFT is ERC721A, Ownable, ReentrancyGuard {
    using Strings for uint256;

    /*///////////////////////////////////////////////////////////////
                            CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant MAX_SUPPLY = 1025;
    uint256 public constant MINT_PRICE = 0 ether;
    uint256 public constant MAX_PER_WALLET = 50;
    uint256 public constant TOTAL_POKEMON = 1025;

    /*///////////////////////////////////////////////////////////////
                          STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    string private baseURI = "https://w3s.link/ipfs/bafybeigii5wrhvhvrbxmv42nqcrr7wmbogtg6gdj2rwbi5awr6yxf4jn3i/";
    string public baseExtension = ".json";
    bool public saleActive = false;



    /*///////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event SaleToggled(bool isActive);

    event Withdrawn(address indexed to, uint256 amount);
    event BaseURIUpdated(string newBaseURI);

    /*///////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor() ERC721A("Pokechain Collection", "POKE") {}

    /*///////////////////////////////////////////////////////////////
                             MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier whenSaleActive() {
        require(saleActive, "Sale is not active");
        _;
    }

    modifier callerIsUser() {
        require(tx.origin == msg.sender, "Caller is another contract");
        _;
    }

    /*///////////////////////////////////////////////////////////////
                          MINT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Public mint function - blind box style
     * @param quantity Number of NFTs to mint
     */
    function mint(uint256 quantity) external payable whenSaleActive callerIsUser {
        require(quantity > 0, "Quantity must be greater than 0");
        require(totalSupply() + quantity <= MAX_SUPPLY, "Exceeds max supply");
        require(_numberMinted(msg.sender) + quantity <= MAX_PER_WALLET, "Exceeds wallet limit of 50");
        require(msg.value >= MINT_PRICE * quantity, "Insufficient payment");


        // Mint the tokens
        _mint(msg.sender, quantity);

        // Refund excess payment
        if (msg.value > MINT_PRICE * quantity) {
            uint256 refund = msg.value - (MINT_PRICE * quantity);
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @dev Deterministic Pokemon ID from tokenId via keccak256
     * No storage needed — computed on read, making batch mints O(1)
     * @param tokenId The token ID to get the Pokemon for
     * @return Pokemon ID (1-1025)
     */
    function _pokemonId(uint256 tokenId) internal pure returns (uint256) {
        uint256 random = uint256(keccak256(abi.encodePacked("POKECHAIN", tokenId)));
        return (random % TOTAL_POKEMON) + 1;
    }

    /*///////////////////////////////////////////////////////////////
                          METADATA URI
    //////////////////////////////////////////////////////////////*/

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    /**
     * @dev Returns the token URI for a given token ID
     * Points to Pokemon metadata based on assigned Pokemon ID
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");

        uint256 pokemonId = _pokemonId(tokenId);
        string memory currentBaseURI = _baseURI();
        
        return bytes(currentBaseURI).length > 0
            ? string(abi.encodePacked(currentBaseURI, pokemonId.toString(), baseExtension))
            : "";
    }

    /**
     * @dev Update the base URI for metadata
     */
    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
        emit BaseURIUpdated(_newBaseURI);
    }

    /**
     * @dev Update the file extension for metadata
     */
    function setBaseExtension(string memory _newExtension) public onlyOwner {
        baseExtension = _newExtension;
    }

    /*///////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Toggle the sale status (emergency stop)
     */
    function toggleSale() external onlyOwner {
        saleActive = !saleActive;
        emit SaleToggled(saleActive);
    }

    /**
     * @dev Withdraw contract balance to owner
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdraw failed");
        
        emit Withdrawn(owner(), balance);
    }

    /*///////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Get the Pokemon ID assigned to a token
     */
    function getPokemonId(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return _pokemonId(tokenId);
    }

    /**
     * @dev Get how many tokens an address has minted
     */
    function walletMinted(address wallet) external view returns (uint256) {
        return _numberMinted(wallet);
    }

    /**
     * @dev Get remaining supply
     */
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    /**
     * @dev Check if sale is active
     */
    function isSaleActive() external view returns (bool) {
        return saleActive;
    }
}
