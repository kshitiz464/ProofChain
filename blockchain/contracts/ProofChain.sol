// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProofChain
 * @author ProofChain Team (Khushi Jangid, Kshitiz Yadav, Kunal Upadhyay)
 * @notice Decentralized document verification via IPFS CID anchoring on-chain
 * @dev Stores IPFS Content Identifiers (CIDs) with uploader address and
 *      block timestamp, providing tamper-evident proof-of-existence.
 *      Duplicate CID anchoring is explicitly rejected to prevent silent overwrites.
 */
contract ProofChain {
    /// @dev Bound storage/gas exposure. CID syntax is validated by the API.
    uint256 public constant MAX_CID_BYTES = 128;
    /// @notice Data stored on-chain for each anchored document
    struct Anchor {
        address uploader;   // Ethereum address of the uploader
        uint256 timestamp;  // Block timestamp at time of anchoring (Unix seconds)
        bool    exists;     // Whether this CID has been anchored
    }

    /// @notice Maps IPFS CID → on-chain anchor record
    mapping(string => Anchor) private _anchors;

    /// @notice Total number of documents anchored
    uint256 public totalAnchored;

    /// @notice Emitted when a new CID is anchored
    event AnchorCreated(
        string  cid,
        address indexed uploader,
        uint256 timestamp
    );

    // ────────────────────────────────────────────────────────────────────────
    // Write Functions
    // ────────────────────────────────────────────────────────────────────────

    /**
     * @notice Anchor a new document CID on-chain with the caller's address and current block time
     * @dev Reverts if CID is empty or has already been anchored
     * @param cid The IPFS Content Identifier of the document to anchor
     */
    function anchor(string calldata cid) external {
        require(bytes(cid).length > 0, "ProofChain: empty CID");
        require(bytes(cid).length <= MAX_CID_BYTES, "ProofChain: CID too long");
        require(!_anchors[cid].exists, "ProofChain: CID already anchored");

        _anchors[cid] = Anchor({
            uploader:  msg.sender,
            timestamp: block.timestamp,
            exists:    true
        });

        unchecked { ++totalAnchored; }

        emit AnchorCreated(cid, msg.sender, block.timestamp);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Read Functions
    // ────────────────────────────────────────────────────────────────────────

    /**
     * @notice Verify whether a CID is anchored and retrieve its proof
     * @param cid The IPFS Content Identifier to look up
     * @return uploader  The address that anchored the document (zero if not anchored)
     * @return timestamp The Unix timestamp when anchored (zero if not anchored)
     * @return exists    True if the CID has been anchored
     */
    function verify(string calldata cid)
        external
        view
        returns (
            address uploader,
            uint256 timestamp,
            bool    exists
        )
    {
        Anchor storage a = _anchors[cid];
        return (a.uploader, a.timestamp, a.exists);
    }
}
