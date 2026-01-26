// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "./ERC721A/ERC721A.sol";
import "./access/Ownable.sol";
import "./utils/Strings.sol";
import "./utils/cryptography/MerkleProof.sol";

contract ProjectINO is ERC721A, Ownable {
    enum SaleConfig {
        PAUSED,
        INOLIST,
        FINAL
    }

    using Strings for uint256;
    string private baseURI;
    string public baseExtension = ".json";
    string public unRevealedURI;
    bool public revealed = false;

    /*///////////////////////////////////////////////////////////////
                          SET SALE PAUSED
    //////////////////////////////////////////////////////////////*/

    SaleConfig public saleConfig = SaleConfig.PAUSED;

    /*///////////////////////////////////////////////////////////////
                          PROJECT INFO
    //////////////////////////////////////////////////////////////*/

    uint256 public constant INO_SUPPLY = 7999;
    uint256 private constant RESERVED_INO = 280;
    uint256 public constant INO_LIMIT = 1;

    /*///////////////////////////////////////////////////////////////
                          TRACKING
    //////////////////////////////////////////////////////////////*/

    bytes32 public merkleRoot;

    mapping(address => bool) public inoListPurchased;

    address private immutable withdrawalAddress;

    constructor(
        address _withdrawalAddress,
        string memory _RBaseURI,
        string memory _unRevealedUri
    ) ERC721A("Project INO", "INO") {
        setBaseURI(_RBaseURI);
        setUnRevealedUri(_unRevealedUri);
        withdrawalAddress = _withdrawalAddress;
        _mint(tx.origin, RESERVED_INO);
    }

    /*///////////////////////////////////////////////////////////////
                      MerkleRoots & Sale Functions
    //////////////////////////////////////////////////////////////*/

    function setSaleConfig(SaleConfig _status) external onlyOwner {
        saleConfig = _status;
    }

    function setMerkleRoots(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    modifier callerIsUser() {
        require(tx.origin == msg.sender, "The caller is another contract");
        _;
    }

    /*///////////////////////////////////////////////////////////////
                          MINT FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function inoListMint(uint256 _amount, bytes32[] memory _proof) external payable callerIsUser {
        require(
            saleConfig == SaleConfig.INOLIST,
            "DEAR SPECIAL ONE, ARRIVAL ON PLANET IS NOT ALLOWED. TRY AGAIN SOON."
        );
        require(
            MerkleProof.verify(_proof, merkleRoot, keccak256(abi.encodePacked(msg.sender))),
            "You are not on the Ino List."
        );
        require(_amount <= INO_LIMIT, "QUANTITY SURPASSES PER-TXN LIMIT");
        require(!inoListPurchased[msg.sender], "INO LIST HAS BEEN USED, TRY AGAIN ON PUBLIC.");
        inoListPurchased[msg.sender] = true;
        require(totalSupply() + _amount <= INO_SUPPLY, "MAX CAP OF INO EXCEEDED");
        _mint(msg.sender, _amount);
    }

    function finalMint(uint256 _amount) external payable callerIsUser {
        require(saleConfig == SaleConfig.FINAL, "ENTRY OF PLANET IS NOT ALLOWED. PLEASE HOLD.");
        require(_amount <= INO_LIMIT, "QUANTITY SURPASSES PER-TXN LIMIT");
        require(totalSupply() + _amount <= INO_SUPPLY, "MAX CAP OF INO EXCEEDED");
        _mint(msg.sender, _amount);
    }

    /*///////////////////////////////////////////////////////////////
                          METADATA URI
    //////////////////////////////////////////////////////////////*/

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function reveal() public onlyOwner {
        revealed = true;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");

        if (revealed == false) {
            return unRevealedURI;
        }

        string memory currentBaseURI = _baseURI();
        return bytes(currentBaseURI).length > 0
            ? string(abi.encodePacked(currentBaseURI, tokenId.toString(), baseExtension))
            : "";
    }

    function setUnRevealedUri(string memory _unRevealedUri) public onlyOwner {
        unRevealedURI = _unRevealedUri;
    }

    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }

    /*///////////////////////////////////////////////////////////////
                      TRACKING NUMBER MINTED
    //////////////////////////////////////////////////////////////*/

    function numberMinted(address _owner) public view returns (uint256) {
        return _numberMinted(_owner);
    }

    function getOwnershipData(uint256 _tokenId) external view returns (TokenOwnership memory) {
        return _ownershipOf(_tokenId);
    }

    /*///////////////////////////////////////////////////////////////
                          WITHDRAW FUNDS
    //////////////////////////////////////////////////////////////*/

    function withdrawFunds() external onlyOwner {
        payable(withdrawalAddress).transfer(address(this).balance);
    }
}
