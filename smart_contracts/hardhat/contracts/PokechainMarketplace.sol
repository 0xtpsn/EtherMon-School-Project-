// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "./utils/ReentrancyGuard.sol";
import "./access/Ownable.sol";

/**
 * @title IERC721
 * @dev Interface for ERC721 NFT standard
 */
interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/**
 * @title PokechainMarketplace
 * @dev Combined marketplace for fixed-price sales and auctions of Pokemon NFTs
 * Features:
 * - Fixed-price listings (approval-based, no escrow)
 * - English auctions with bid escrow
 * - ReentrancyGuard on all payable functions
 * - Pausable for emergency stop
 * - Platform fee support (optional)
 */
contract PokechainMarketplace is ReentrancyGuard, Ownable {

    /*///////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    IERC721 public immutable nftContract; // The NFT contract address!!!
    
    uint256 public platformFeeBps = 250; // 2.5% default (in basis points)
    uint256 public constant MAX_FEE_BPS = 1000; // Max 10%
    
    bool public paused = false;

    /*///////////////////////////////////////////////////////////////
                          FIXED-PRICE LISTINGS
    //////////////////////////////////////////////////////////////*/

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    /*///////////////////////////////////////////////////////////////
                              AUCTIONS
    //////////////////////////////////////////////////////////////*/

    struct Auction {
        address seller;
        uint256 startingPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        bool active;
        bool settled;
    }

    mapping(uint256 => Auction) public auctions;
    
    // Pending returns for outbid bidders
    mapping(address => uint256) public pendingReturns;

    /*///////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    // Listing events
    event ItemListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId);
    event ListingUpdated(uint256 indexed tokenId, uint256 newPrice);
    event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    // Auction events
    event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 startingPrice, uint256 endTime);
    event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event AuctionEnded(uint256 indexed tokenId, address winner, uint256 amount);
    event AuctionCancelled(uint256 indexed tokenId);

    // Admin events
    event FundsWithdrawn(address indexed user, uint256 amount);
    event PlatformFeeUpdated(uint256 newFeeBps);
    event MarketplacePaused(bool isPaused);

    /*///////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _nftContract) {
        require(_nftContract != address(0), "Invalid NFT contract address");
        nftContract = IERC721(_nftContract);
    }

    /*///////////////////////////////////////////////////////////////
                             MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier whenNotPaused() {
        require(!paused, "Marketplace is paused");
        _;
    }

    modifier notListed(uint256 tokenId) {
        require(!listings[tokenId].active, "Already listed for sale");
        _;
    }

    modifier notInAuction(uint256 tokenId) {
        require(!auctions[tokenId].active, "Already in auction");
        _;
    }

    /*///////////////////////////////////////////////////////////////
                        FIXED-PRICE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev List an NFT for fixed-price sale
     * @param tokenId The token ID to list
     * @param price The sale price in wei
     */
    function listItem(uint256 tokenId, uint256 price) 
        external 
        whenNotPaused 
        notListed(tokenId) 
        notInAuction(tokenId) 
    {
        require(price > 0, "Price must be greater than 0");
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(
            nftContract.getApproved(tokenId) == address(this) ||
            nftContract.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            active: true
        });

        emit ItemListed(tokenId, msg.sender, price);
    }

    /**
     * @dev Cancel a listing
     * @param tokenId The token ID to cancel
     */
    function cancelListing(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "Not listed");
        require(listing.seller == msg.sender, "Not the seller");

        delete listings[tokenId];
        emit ListingCancelled(tokenId);
    }

    /**
     * @dev Update listing price
     * @param tokenId The token ID to update
     * @param newPrice The new price in wei
     */
    function updateListing(uint256 tokenId, uint256 newPrice) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "Not listed");
        require(listing.seller == msg.sender, "Not the seller");
        require(newPrice > 0, "Price must be greater than 0");

        listing.price = newPrice;
        emit ListingUpdated(tokenId, newPrice);
    }

    /**
     * @dev Buy a listed NFT
     * @param tokenId The token ID to buy
     */
    function buyItem(uint256 tokenId) external payable whenNotPaused nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.active, "Not listed");
        require(msg.value >= listing.price, "Insufficient payment");

        // Clear listing before transfers (reentrancy protection)
        delete listings[tokenId];

        // Calculate fees
        uint256 fee = (listing.price * platformFeeBps) / 10000;
        uint256 sellerProceeds = listing.price - fee;

        // Transfer NFT to buyer
        nftContract.transferFrom(listing.seller, msg.sender, tokenId);

        // Transfer payment to seller
        (bool success, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(success, "Payment to seller failed");

        // Refund excess payment
        if (msg.value > listing.price) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - listing.price}("");
            require(refundSuccess, "Refund failed");
        }

        emit ItemSold(tokenId, listing.seller, msg.sender, listing.price);
    }

    /*///////////////////////////////////////////////////////////////
                          AUCTION FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Create an auction for an NFT
     * @param tokenId The token ID to auction
     * @param startingPrice The starting price in wei
     * @param duration Auction duration in seconds (1 hour to 7 days)
     */
    function createAuction(uint256 tokenId, uint256 startingPrice, uint256 duration)
        external
        whenNotPaused
        notListed(tokenId)
        notInAuction(tokenId)
    {
        require(startingPrice > 0, "Starting price must be greater than 0");
        require(duration >= 1 hours, "Duration must be at least 1 hour");
        require(duration <= 7 days, "Duration must be at most 7 days");
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(
            nftContract.getApproved(tokenId) == address(this) ||
            nftContract.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        uint256 endTime = block.timestamp + duration;

        auctions[tokenId] = Auction({
            seller: msg.sender,
            startingPrice: startingPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: endTime,
            active: true,
            settled: false
        });

        emit AuctionCreated(tokenId, msg.sender, startingPrice, endTime);
    }

    /**
     * @dev Place a bid on an auction
     * @param tokenId The token ID to bid on
     */
    function placeBid(uint256 tokenId) external payable whenNotPaused nonReentrant {
        Auction storage auction = auctions[tokenId];
        require(auction.active, "Auction not active");
        require(!auction.settled, "Auction already settled");
        require(block.timestamp < auction.endTime, "Auction has ended");
        require(msg.sender != auction.seller, "Seller cannot bid");

        // First bid must meet starting price, subsequent bids must exceed highest
        if (auction.highestBid == 0) {
            require(msg.value >= auction.startingPrice, "Bid below starting price");
        } else {
            require(msg.value > auction.highestBid, "Bid must exceed current highest");
        }

        // Refund the previous highest bidder
        if (auction.highestBidder != address(0)) {
            pendingReturns[auction.highestBidder] += auction.highestBid;
        }

        // Update auction with new highest bid
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        emit BidPlaced(tokenId, msg.sender, msg.value);
    }

    /**
     * @dev End an auction and transfer NFT + funds
     * @param tokenId The token ID of the auction to end
     */
    function endAuction(uint256 tokenId) external nonReentrant {
        Auction storage auction = auctions[tokenId];
        require(auction.active, "Auction not active");
        require(!auction.settled, "Auction already settled");
        require(block.timestamp >= auction.endTime, "Auction not yet ended");

        auction.settled = true;
        auction.active = false;

        if (auction.highestBidder != address(0)) {
            // Calculate fees
            uint256 fee = (auction.highestBid * platformFeeBps) / 10000;
            uint256 sellerProceeds = auction.highestBid - fee;

            // Transfer NFT to winner
            nftContract.transferFrom(auction.seller, auction.highestBidder, tokenId);

            // Transfer payment to seller
            (bool success, ) = payable(auction.seller).call{value: sellerProceeds}("");
            require(success, "Payment to seller failed");

            emit AuctionEnded(tokenId, auction.highestBidder, auction.highestBid);
        } else {
            // No bids - auction ended without a sale
            emit AuctionEnded(tokenId, address(0), 0);
        }
    }

    /**
     * @dev Cancel an auction (only if no bids)
     * @param tokenId The token ID of the auction to cancel
     */
    function cancelAuction(uint256 tokenId) external {
        Auction storage auction = auctions[tokenId];
        require(auction.active, "Auction not active");
        require(auction.seller == msg.sender, "Not the seller");
        require(auction.highestBidder == address(0), "Cannot cancel with bids");

        delete auctions[tokenId];
        emit AuctionCancelled(tokenId);
    }

    /**
     * @dev Withdraw pending returns from being outbid
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "No funds to withdraw");

        // Clear pending returns before transfer (reentrancy protection)
        pendingReturns[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdraw failed");

        emit FundsWithdrawn(msg.sender, amount);
    }

    /*///////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Pause/unpause the marketplace
     */
    function togglePause() external onlyOwner {
        paused = !paused;
        emit MarketplacePaused(paused);
    }

    /**
     * @dev Update the platform fee
     * @param newFeeBps New fee in basis points (100 = 1%)
     */
    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(newFeeBps);
    }

    /**
     * @dev Withdraw accumulated platform fees
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdraw failed");

        emit FundsWithdrawn(owner(), balance);
    }

    /*///////////////////////////////////////////////////////////////
                          VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Get listing details
     */
    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return listings[tokenId];
    }

    /**
     * @dev Get auction details
     */
    function getAuction(uint256 tokenId) external view returns (Auction memory) {
        return auctions[tokenId];
    }

    /**
     * @dev Check if token is listed
     */
    function isListed(uint256 tokenId) external view returns (bool) {
        return listings[tokenId].active;
    }

    /**
     * @dev Check if token is in auction
     */
    function isInAuction(uint256 tokenId) external view returns (bool) {
        return auctions[tokenId].active;
    }

    /**
     * @dev Get pending returns for an address
     */
    function getPendingReturns(address user) external view returns (uint256) {
        return pendingReturns[user];
    }

    /*///////////////////////////////////////////////////////////////
                        TOKEN STATUS (CONVENIENCE)
    //////////////////////////////////////////////////////////////*/

    enum TokenStatus { NONE, LISTED, IN_AUCTION }

    /**
     * @dev Get the status of a token in one call
     * @param tokenId The token ID to check
     * @return status Whether token is NONE, LISTED, or IN_AUCTION
     * @return price The listing price or current highest bid (or starting price if no bids)
     * @return seller The seller's address
     * @return endTime The auction end time (0 for listings)
     */
    function getTokenStatus(uint256 tokenId) external view returns (
        TokenStatus status,
        uint256 price,
        address seller,
        uint256 endTime
    ) {
        if (listings[tokenId].active) {
            Listing memory listing = listings[tokenId];
            return (TokenStatus.LISTED, listing.price, listing.seller, 0);
        }
        
        if (auctions[tokenId].active) {
            Auction memory auction = auctions[tokenId];
            uint256 currentPrice = auction.highestBid > 0 ? auction.highestBid : auction.startingPrice;
            return (TokenStatus.IN_AUCTION, currentPrice, auction.seller, auction.endTime);
        }
        
        return (TokenStatus.NONE, 0, address(0), 0);
    }
}
