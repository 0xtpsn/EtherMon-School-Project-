// SPDX-License-Identifier: MIT
// ═══════════════════════════════════════════════════════════════════════════════
//                    POKECHAIN NFT CONTRACT - IMPLEMENTATION PLAN
// ═══════════════════════════════════════════════════════════════════════════════
// 
// Blind box style Pokémon NFT collection using ERC721A for gas optimization.
//
// ═══════════════════════════════════════════════════════════════════════════════

/*
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CONTRACT OVERVIEW                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

Name:           Pokechain Collection
Symbol:         POKE
Standard:       ERC721A (gas-optimized batch minting)
Max Supply:     1,111 NFTs
Mint Price:     0.01 ETH
Per Wallet:     Max 50 mints
Sale Type:      Public (no whitelist)
Reveal:         Instant (no hidden metadata)
Randomization:  On-mint Pokémon assignment (blind box)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CONTRACT STRUCTURE                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

PokechainNFT.sol
├── Imports
│   ├── ERC721A.sol          - Gas-optimized NFT standard
│   ├── Ownable.sol          - Admin access control
│   ├── ReentrancyGuard.sol  - Reentrancy protection
│   └── Strings.sol          - uint256 to string conversion
│
├── State Variables
│   ├── MAX_SUPPLY           - 1111 (constant)
│   ├── MINT_PRICE           - 0.01 ether (constant)
│   ├── MAX_PER_WALLET       - 50 (constant)
│   ├── baseURI              - Metadata base URL
│   ├── saleActive           - Toggle for minting (bool)
│   └── tokenToPokemonId     - Mapping: tokenId => pokemonId (for randomization)
│
├── Modifiers
│   ├── whenSaleActive       - Require saleActive == true
│   └── onlyOwner            - From Ownable (admin only)
│
├── Public Functions
│   ├── mint(quantity)       - Public mint with payment
│   ├── tokenURI(tokenId)    - Returns metadata URI
│   ├── getPokemonId(tokenId)- Returns which Pokémon this token is
│   └── walletMinted(address)- Check how many an address has minted
│
├── Admin Functions (onlyOwner)
│   ├── toggleSale()         - Turn minting on/off
│   ├── setBaseURI(uri)      - Update metadata base URL
│   └── withdraw()           - Withdraw contract balance
│
└── Events
    ├── SaleToggled(bool)
    ├── Minted(address, tokenId, pokemonId)
    └── Withdrawn(address, amount)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1: CONSTANTS & STATE                            │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Constants:
    uint256 public constant MAX_SUPPLY = 1111;
    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant MAX_PER_WALLET = 50;
    uint256 public constant TOTAL_POKEMON = 151;  // Gen 1 Pokémon pool

[ ] State Variables:
    string private baseURI;
    bool public saleActive = false;
    mapping(uint256 => uint256) public tokenToPokemonId;  // tokenId => pokemonId


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 2: MODIFIERS                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Sale Active Modifier:
    modifier whenSaleActive() {
        require(saleActive, "Sale is not active");
        _;
    }

[ ] Already have from imports:
    - onlyOwner (from Ownable)
    - nonReentrant (from ReentrancyGuard)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 3: MINT FUNCTION                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] mint(uint256 quantity) external payable whenSaleActive

    Checks:
    - require(quantity > 0, "Quantity must be > 0")
    - require(totalSupply() + quantity <= MAX_SUPPLY, "Exceeds max supply")
    - require(_numberMinted(msg.sender) + quantity <= MAX_PER_WALLET, "Exceeds wallet limit")
    - require(msg.value >= MINT_PRICE * quantity, "Insufficient payment")

    Logic:
    - Get starting tokenId before mint: uint256 startToken = _nextTokenId()
    - Call _mint(msg.sender, quantity)
    - For each token minted, assign random Pokémon:
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startToken + i;
            uint256 pokemonId = _randomPokemonId(tokenId);
            tokenToPokemonId[tokenId] = pokemonId;
            emit Minted(msg.sender, tokenId, pokemonId);
        }

    - Refund excess ETH if overpaid


┌─────────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 4: RANDOMIZATION LOGIC                               │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] _randomPokemonId(uint256 tokenId) internal view returns (uint256)

    Simple pseudo-random (acceptable for coursework, not production):
    
    uint256 random = uint256(keccak256(abi.encodePacked(
        block.timestamp,
        block.prevrandao,      // replaces block.difficulty post-merge
        msg.sender,
        tokenId,
        totalSupply()
    )));
    
    return (random % TOTAL_POKEMON) + 1;  // Returns 1-151

    NOTE: This is deterministic at the time of minting. For true randomness,
    would need Chainlink VRF (optional enhancement, not required for coursework).


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 5: METADATA (tokenURI)                            │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] tokenURI(uint256 tokenId) public view override returns (string memory)

    - require(_exists(tokenId), "Token does not exist")
    - Get pokemonId from tokenToPokemonId[tokenId]
    - Return: baseURI + pokemonId + ".json"
    
    Example: If tokenId 5 got Pikachu (pokemonId 25):
    Returns: "https://yoursite.com/metadata/25.json"

    This way multiple tokens can point to the same Pokémon metadata!


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 6: ADMIN FUNCTIONS                                │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] toggleSale() external onlyOwner
    - saleActive = !saleActive
    - emit SaleToggled(saleActive)

[ ] setBaseURI(string memory uri) external onlyOwner
    - baseURI = uri

[ ] withdraw() external onlyOwner nonReentrant
    - uint256 balance = address(this).balance
    - require(balance > 0, "No funds to withdraw")
    - (bool success, ) = payable(owner()).call{value: balance}("")
    - require(success, "Withdraw failed")
    - emit Withdrawn(owner(), balance)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PHASE 7: EVENTS                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Events for frontend/indexer:

event SaleToggled(bool isActive);
event Minted(address indexed to, uint256 indexed tokenId, uint256 pokemonId);
event Withdrawn(address indexed to, uint256 amount);


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 8: VIEW FUNCTIONS                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Utility getters:

function getPokemonId(uint256 tokenId) external view returns (uint256)
    - Returns the Pokémon assigned to this token

function walletMinted(address wallet) external view returns (uint256)
    - Returns _numberMinted(wallet) from ERC721A

function remainingSupply() external view returns (uint256)
    - Returns MAX_SUPPLY - totalSupply()


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          SECURITY CHECKLIST                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

[x] ReentrancyGuard        - Applied to withdraw()
[x] Access Control         - onlyOwner on admin functions
[x] Pausable (toggleSale)  - Emergency stop via saleActive flag
[x] Overflow Protection    - Solidity 0.8+ built-in
[x] Events                 - Proper emission for all state changes
[ ] Tests                  - To be written in Hardhat


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION ORDER                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

1. [ ] Create contract file in smart_contracts/hardhat/contracts/PokechainNFT.sol
2. [ ] Import dependencies (ERC721A, Ownable, ReentrancyGuard)
3. [ ] Define constants and state variables
4. [ ] Implement mint() with all checks
5. [ ] Implement randomization logic
6. [ ] Implement tokenURI() override
7. [ ] Implement admin functions (toggleSale, setBaseURI, withdraw)
8. [ ] Add events
9. [ ] Write comprehensive tests
10.[ ] Create deployment script


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          METADATA STRUCTURE                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

Each Pokémon (1-151) needs a JSON file at {baseURI}/{pokemonId}.json:

{
    "name": "Pikachu",
    "description": "Electric-type Pokémon. Pokechain Collection.",
    "image": "https://yoursite.com/images/25.png",
    "attributes": [
        {"trait_type": "Type", "value": "Electric"},
        {"trait_type": "Pokedex Number", "value": 25},
        {"trait_type": "HP", "value": 35},
        {"trait_type": "Attack", "value": 55},
        {"trait_type": "Defense", "value": 40},
        {"trait_type": "Generation", "value": 1}
    ]
}

Data source: PokéAPI (https://pokeapi.co/)
Script needed: Fetch all 151 Gen 1 Pokémon → Generate JSON files

*/
