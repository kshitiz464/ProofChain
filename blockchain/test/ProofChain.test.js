const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ProofChain", function () {
  let proofChain;
  let owner, addr1, addr2;

  const CID_A = "QmTestCIDAlpha111111";
  const CID_B = "QmTestCIDBeta2222222";

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const ProofChainFactory = await ethers.getContractFactory("ProofChain");
    proofChain = await ProofChainFactory.deploy();
    await proofChain.waitForDeployment();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // anchor()
  // ──────────────────────────────────────────────────────────────────────────
  describe("anchor()", function () {
    it("should successfully anchor a new CID and emit AnchorCreated", async function () {
      await expect(proofChain.connect(addr1).anchor(CID_A))
        .to.emit(proofChain, "AnchorCreated")
        .withArgs(CID_A, addr1.address, anyValue);
    });

    it("should increment totalAnchored after each anchor", async function () {
      expect(await proofChain.totalAnchored()).to.equal(0);
      await proofChain.anchor(CID_A);
      expect(await proofChain.totalAnchored()).to.equal(1);
      await proofChain.connect(addr1).anchor(CID_B);
      expect(await proofChain.totalAnchored()).to.equal(2);
    });

    it("should reject duplicate CID anchoring", async function () {
      await proofChain.anchor(CID_A);
      await expect(proofChain.anchor(CID_A))
        .to.be.revertedWith("ProofChain: CID already anchored");
    });

    it("should reject duplicate even from a different address", async function () {
      await proofChain.connect(owner).anchor(CID_A);
      await expect(proofChain.connect(addr1).anchor(CID_A))
        .to.be.revertedWith("ProofChain: CID already anchored");
    });

    it("should reject an empty CID string", async function () {
      await expect(proofChain.anchor(""))
        .to.be.revertedWith("ProofChain: empty CID");
    });

    it("bounds CID storage without restricting the account that anchors it", async function () {
      const max = Number(await proofChain.MAX_CID_BYTES());
      await expect(proofChain.connect(addr2).anchor("b".repeat(max + 1)))
        .to.be.revertedWith("ProofChain: CID too long");
      await expect(proofChain.connect(addr2).anchor("b".repeat(max)))
        .to.emit(proofChain, "AnchorCreated").withArgs("b".repeat(max), addr2.address, anyValue);
      expect(await proofChain.totalAnchored()).to.equal(1);
    });

    it("should store the correct uploader address on-chain", async function () {
      await proofChain.connect(addr1).anchor(CID_A);
      const [uploader, , exists] = await proofChain.verify(CID_A);
      expect(uploader).to.equal(addr1.address);
      expect(exists).to.be.true;
    });

    it("should store a timestamp close to current block time", async function () {
      const tx      = await proofChain.anchor(CID_A);
      const receipt = await tx.wait();
      const block   = await ethers.provider.getBlock(receipt.blockNumber);

      const [, onChainTs, exists] = await proofChain.verify(CID_A);
      expect(exists).to.be.true;
      expect(Number(onChainTs)).to.equal(block.timestamp);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // verify()
  // ──────────────────────────────────────────────────────────────────────────
  describe("verify()", function () {
    it("should return exists=false for an un-anchored CID", async function () {
      const [, , exists] = await proofChain.verify("nonexistent-cid-xyz");
      expect(exists).to.be.false;
    });

    it("should return zero-address uploader for un-anchored CID", async function () {
      const [uploader, , ] = await proofChain.verify("nonexistent-cid-xyz");
      expect(uploader).to.equal(ethers.ZeroAddress);
    });

    it("should allow verification by any address (no auth required)", async function () {
      await proofChain.connect(owner).anchor(CID_A);
      // addr2 (third party) can verify
      const [uploader, , exists] = await proofChain.connect(addr2).verify(CID_A);
      expect(exists).to.be.true;
      expect(uploader).to.equal(owner.address);
    });

    it("should correctly handle multiple CIDs independently", async function () {
      await proofChain.connect(owner).anchor(CID_A);
      await proofChain.connect(addr1).anchor(CID_B);

      const [u1, , e1] = await proofChain.verify(CID_A);
      const [u2, , e2] = await proofChain.verify(CID_B);

      expect(e1).to.be.true;
      expect(e2).to.be.true;
      expect(u1).to.equal(owner.address);
      expect(u2).to.equal(addr1.address);
    });
  });
});
