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
 * - Randomized Pokemon assignment on mint (blind box)
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
    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant MAX_PER_WALLET = 50;
    uint256 public constant TOTAL_POKEMON = 1025;

    /*///////////////////////////////////////////////////////////////
                          STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    string private baseURI = "https://bafybeienzjyalm2axjk3gx75mcrbjjjv2ej3j5guoaeddjifgryheut57m.ipfs.dweb.link/";
    string public baseExtension = ".json";
    bool public saleActive = false;

    // Mapping from tokenId to Pokemon ID (1-1025)
    mapping(uint256 => uint256) public tokenToPokemonId;

    /*///////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event SaleToggled(bool isActive);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 pokemonId);
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

        uint256 startTokenId = _nextTokenId();

        // Mint the tokens
        _mint(msg.sender, quantity);

        // Assign random Pokemon to each token
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startTokenId + i;
            uint256 pokemonId = _randomPokemonId(tokenId);
            tokenToPokemonId[tokenId] = pokemonId;
            emit Minted(msg.sender, tokenId, pokemonId);
        }

        // Refund excess payment
        if (msg.value > MINT_PRICE * quantity) {
            uint256 refund = msg.value - (MINT_PRICE * quantity);
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @dev Generate pseudo-random Pokemon ID based on on-chain data
     * @param tokenId The token ID being minted
     * @return Pokemon ID (1-1025)
     */
    function _randomPokemonId(uint256 tokenId) internal view returns (uint256) {
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.difficulty,  // Note: Use block.prevrandao for Solidity 0.8.18+
            msg.sender,
            tokenId,
            totalSupply()
        )));
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

        uint256 pokemonId = tokenToPokemonId[tokenId];
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
        return tokenToPokemonId[tokenId];
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
