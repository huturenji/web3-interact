import { expect } from "chai";
import hre from "hardhat";

describe("AdvancedToken", function () {
  let network;
  let ethers;
  let token;
  let owner, addr1, addr2;

  before(async function () {
    network = await hre.network.connect();
    ethers = network.ethers;
  });

  async function deployTokenFixture() {
    [owner, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("AdvancedToken");
    const token = await Token.deploy(
      "Advanced Token",
      "ADVT",
      1000000,
      owner.address,
    );
    await token.waitForDeployment();

    return {
      token,
      owner,
      addr1,
      addr2,
    };
  }

  beforeEach(async function () {
    const deployed = await deployTokenFixture();
    token = deployed.token;
    owner = deployed.owner;
    addr1 = deployed.addr1;
    addr2 = deployed.addr2;
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const adminRole = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(adminRole, owner.address)).to.be.true;
    });

    it("Should assign the initial supply to the owner", async function () {
      const balance = await token.balanceOf(owner.address);
      expect(balance).to.equal(1000000);
    });

    it("Should set initial config values", async function () {
      const config = await token.config();
      const decimalFactor = ethers.parseEther("1");

      expect(config.maxTransferAmount).to.equal(BigInt(10000) * decimalFactor);
      expect(config.dailyLimit).to.equal(BigInt(50000) * decimalFactor);
      expect(config.cooldownPeriod).to.equal(300);
      expect(config.transfersEnabled).to.be.true;
    });
  });

  describe("SafeMint", function () {
    it("Should mint tokens successfully with MINTER_ROLE", async function () {
      await token.connect(owner).safeMint(addr1.address, 1000);

      const balance = await token.balanceOf(addr1.address);
      expect(balance).to.equal(1000);
    });

    it("Should fail if caller doesn't have MINTER_ROLE", async function () {
      await expect(token.connect(addr1).safeMint(addr2.address, 1000)).to.be
        .rejected;
    });

    it("Should fail to mint to zero address", async function () {
      await expect(token.connect(owner).safeMint(ethers.ZeroAddress, 1000)).to
        .be.rejected;
    });
  });

  describe("SafeBurn", function () {
    it("Should burn tokens successfully with BURNER_ROLE", async function () {
      // First mint some tokens to addr1
      await token.connect(owner).safeMint(addr1.address, 1000);

      // Then burn them
      await token.connect(owner).safeBurn(addr1.address, 500);

      const balance = await token.balanceOf(addr1.address);
      expect(balance).to.equal(500);
    });

    it("Should fail if burn amount exceeds balance", async function () {
      await expect(token.connect(owner).safeBurn(addr1.address, 1000)).to.be
        .rejected;
    });
  });

  describe("Transfer validation", function () {
    it("Should allow normal transfers within limits", async function () {
      await token.connect(owner).transfer(addr1.address, 1000);

      const balance = await token.balanceOf(addr1.address);
      expect(balance).to.equal(1000);
    });

    it("Should fail if transfer exceeds max amount", async function () {
      // Need to use actual decimals from the contract
      const decimals = await token.decimals();
      const decimalFactor = 10n ** BigInt(decimals);
      const amount = BigInt(10001) * decimalFactor; // Exceeds max of 10000 * 10^decimals

      await expect(
        token.connect(owner).transfer(addr1.address, amount),
      ).to.be.revertedWithCustomError(token, "ExceedMaxTransfer");
    });

    it("Should fail if transfers are disabled", async function () {
      // Disable transfers
      await token
        .connect(owner)
        .updateConfig(
          BigInt(10000) * ethers.parseEther("1"),
          BigInt(50000) * ethers.parseEther("1"),
          300,
          false,
        );

      await expect(
        token.connect(owner).transfer(addr1.address, 1000),
      ).to.be.revertedWithCustomError(token, "TransfersDisabled");
    });
  });

  describe("Pause/Unpause", function () {
    it("Should pause and unpause the contract", async function () {
      // Pause the contract
      await token.connect(owner).pause();

      // Transfers should fail when paused
      await expect(
        token.connect(owner).transfer(addr1.address, 1000),
      ).to.be.revertedWith("Pausable: paused");

      // Unpause the contract
      await token.connect(owner).unpause();

      // Transfers should succeed after unpause
      await token.connect(owner).transfer(addr2.address, 1000);
    });
  });

  describe("EmergencyWithdraw", function () {
    it("Should allow emergency withdrawal when paused", async function () {
      // First transfer some tokens to the contract
      await token.connect(owner).transfer(await token.getAddress(), 1000);

      // Pause the contract
      await token.connect(owner).pause();

      // Emergency withdraw
      await token.connect(owner).emergencyWithdraw(addr1.address, 1000);

      const balance = await token.balanceOf(addr1.address);
      expect(balance).to.equal(1000);
    });
  });

  describe("getUserState", function () {
    it("Should return correct user state", async function () {
      // Make a transfer
      await token.connect(owner).transfer(addr1.address, 1000);

      const userState = await token.getUserState(owner.address);

      expect(userState.lastTransferTime).to.be.greaterThan(0);
      expect(userState.amountTransferredToday).to.equal(1000);
      // Remaining daily limit calculation
      const expectedRemaining =
        BigInt(50000) * ethers.parseEther("1") - BigInt(1000);
      expect(userState.remainingDailyLimit).to.equal(expectedRemaining);
    });
  });
});
