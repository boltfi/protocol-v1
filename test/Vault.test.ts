import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import { decodeEventLog, getAddress } from "viem";

chai.use(chaiAsPromised);
describe("Vault", function () {
  async function getEmittedEvent(
    hash: `0x${string}`,
    abi: any,
    eventName: string,
  ) {
    const publicClient = await hre.viem.getPublicClient();
    const { logs } = await publicClient.getTransactionReceipt({ hash });
    for (let log of logs) {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (event.eventName === eventName) {
        return event.args;
      }
    }
    return {};
  }
  async function fixtureNewVault() {
    const [deployer, owner, user] = await hre.viem.getWalletClients();

    // await hre.deployments.fixture(['Vault']);

    // const Vault = await hre.deployments.get('Vault');
    // const vault = await hre.viem.getContractAt('Vault', Vault.address);

    const usdt = await hre.viem.deployContract("MockUSDT");
    const vault = await hre.viem.deployContract("Vault", [
      "Vault",
      "BLT",
      usdt.address,
      owner.account.address,
    ]);

    await usdt.write.mint([
      user.account.address,
      BigInt(100_000) * BigInt(10 ** 6),
    ]);

    return {
      vault,
      deployer,
      user,
      usdt,
      owner: owner,
    };
  }

  async function fixtureWithPendingDeposit() {
    const deployment = await loadFixture(fixtureNewVault);

    const { vault, user, usdt } = await loadFixture(fixtureNewVault);

    await usdt.write.approve([vault.address, toBN(10_000, 6)], {
      account: user.account,
    });

    await vault.write.deposit([toBN(10_000, 6), user.account.address], {
      account: user.account,
    });

    return deployment;
  }

  async function fixtureWithDeposit() {
    const deployment = await loadFixture(fixtureWithPendingDeposit);

    const { vault, owner } = deployment;

    await vault.write.updatePrice([BigInt(10 ** (18 - 6))], {
      account: owner.account,
    });

    expect(await vault.read.totalSupply()).to.equal(BigInt(0));
    expect(await vault.read.totalAssets()).to.equal(BigInt(0));

    await vault.write.processDeposits([BigInt(1)], { account: owner.account });

    return deployment;
  }

  async function fixtureWithPendingRedeem() {
    const deployment = await loadFixture(fixtureWithDeposit);
    const { vault, user } = deployment;

    await vault.write.redeem(
      [toBN(10_000, 18), user.account.address, user.account.address],
      {
        account: user.account,
      },
    );

    return deployment;
  }

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { vault } = await loadFixture(fixtureNewVault);
      expect(await vault.read.name()).to.equal("Vault");
      expect(await vault.read.symbol()).to.equal("BLT");
    });

    it("Should set the right asset", async function () {
      const { vault, usdt } = await loadFixture(fixtureNewVault);
      expect(await vault.read.asset()).to.equal(getAddress(usdt.address));
    });

    it("Sets the correct initial price", async function () {
      const { vault } = await loadFixture(fixtureNewVault);
      expect(await vault.read.price()).to.equal(BigInt(0));
      expect(await vault.read.priceUpdatedAt()).to.equal(BigInt(0));
    });
    it("Sets the correct initial withdrawal fee", async function () {
      const { vault } = await loadFixture(fixtureNewVault);
      expect(await vault.read.withdrawalFee()).to.equal(BigInt(0));
    });

    it("Should set the right owner", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);

      expect(await vault.read.owner()).to.equal(
        getAddress(owner.account.address),
      );
    });
  });

  describe("Ownership", function () {
    it("Can change owner", async function () {
      const { vault, owner, user } = await loadFixture(fixtureNewVault);
      await vault.write.transferOwnership([user.account.address], {
        account: owner.account,
      });

      expect(await vault.read.owner()).to.equal(
        getAddress(user.account.address),
      );
    });

    it("Can reject changing to null address", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.transferOwnership(
          ["0x0000000000000000000000000000000000000000"],
          {
            account: owner.account,
          },
        ),
      ).to.eventually.be.rejectedWith(
        'OwnableInvalidOwner("0x0000000000000000000000000000000000000000")',
      );
    });
  });
  describe("Pauseable", function () {
    it("Rejects being paused paused by user", async function () {
      const { vault, user } = await loadFixture(fixtureNewVault);
      expect(await vault.read.paused()).to.equal(false);
      await expect(
        vault.write.pause({ account: user.account }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Can be paused by owner", async function () {
      const { vault, owner, user } = await loadFixture(fixtureNewVault);
      expect(await vault.read.paused()).to.equal(false);
      await vault.write.pause({ account: owner.account });
      expect(await vault.read.paused()).to.equal(true);
    });
    it("Can rejects user actions when paused", async function () {
      const { vault, owner, user } = await loadFixture(fixtureNewVault);
      await vault.write.pause({ account: owner.account });

      await expect(
        vault.write.deposit(
          [toBN(10_000, 6), getAddress(user.account.address)],
          { account: user.account },
        ),
      ).to.eventually.be.rejectedWith("EnforcedPause");

      await expect(
        vault.write.redeem(
          [
            toBN(10_000, 6),
            getAddress(user.account.address),
            getAddress(user.account.address),
          ],
          { account: user.account },
        ),
      ).to.eventually.be.rejectedWith("EnforcedPause");
    });
  });

  describe("Price management", function () {
    it("Owner can update price", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);
      const price = BigInt(10 ** 6);
      const hash = await vault.write.updatePrice([price], {
        account: owner.account,
      });

      const now = await time.latest();
      expect(await vault.read.price()).to.equal(price);
      expect(await vault.read.priceUpdatedAt()).to.equal(BigInt(now));

      expect(await getEmittedEvent(hash, vault.abi, "PriceUpdate")).to.deep.equal({
        price,
      });
    });

    it("Deployer cannot update the price", async function () {
      const { vault, deployer } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updatePrice([BigInt(10 ** 6)], {
          account: deployer.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Users cannot update the price", async function () {
      const { vault, user } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updatePrice([BigInt(10 ** 6)], {
          account: user.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("Withdrawal Fee management", function () {
    it("Owner can update withdrawal fee", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);
      const withdrawalFee = BigInt(10 ** 6);
      await vault.write.updateWithdrawalFee([withdrawalFee], {
        account: owner.account,
      });
      expect(await vault.read.withdrawalFee()).to.equal(withdrawalFee);
    });

    it("Deployer cannot update the withdrawal fee", async function () {
      const { vault, deployer } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updateWithdrawalFee([BigInt(10 ** 6)], {
          account: deployer.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Users cannot update the withdrawal fee", async function () {
      const { vault, user } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updateWithdrawalFee([BigInt(10 ** 6)], {
          account: user.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });
  });

  const toBN = (n: number, decimals = 6) => BigInt(n) * BigInt(10 ** decimals);

  describe("Deposit", function () {
    it("Can queue user deposit", async function () {
      const { vault, usdt, user, owner } = await loadFixture(fixtureNewVault);

      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(100_000, 6),
      );

      await usdt.write.approve([vault.address, toBN(10_000, 6)], {
        account: user.account,
      });

      await vault.write.deposit([toBN(10_000, 6), user.account.address], {
        account: user.account,
      });

      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(90_000, 6),
      );

      expect(await usdt.read.balanceOf([vault.address])).to.equal(toBN(0, 6));
      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        toBN(10_000, 6),
      );

      expect(await vault.read.pendingDeposits()).to.deep.equal([
        {
          sender: getAddress(user.account.address),
          receiver: getAddress(user.account.address),
          assets: toBN(10_000, 6),
          timestamp: await time.latest(),
        },
      ]);
    });
  });

  describe("Process Deposit", function () {
    it("Can reject when price is outdated", async function () {
      const { vault, owner } = await loadFixture(fixtureWithPendingDeposit);
      await expect(
        vault.write.processDeposits([BigInt(1)], {
          account: owner.account,
        }),
      ).to.eventually.be.rejectedWith("Price is outdated");
    });

    it("Can reject when user ", async function () {
      const { vault, owner, user } = await loadFixture(
        fixtureWithPendingDeposit,
      );
      await vault.write.updatePrice([BigInt(10 ** (18 - 6))], {
        account: owner.account,
      });
      await expect(
        vault.write.processDeposits([BigInt(1)], {
          account: user.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Can process queued deposits", async function () {
      const { vault, usdt, user, owner } = await loadFixture(
        fixtureWithPendingDeposit,
      );

      expect(await vault.read.pendingDeposits()).to.deep.equal([
        {
          sender: getAddress(user.account.address),
          receiver: getAddress(user.account.address),
          assets: toBN(10_000, 6),
          timestamp: await time.latest(),
        },
      ]);
      await vault.write.updatePrice([BigInt(10 ** (18 - 6))], {
        account: owner.account,
      });

      expect(await vault.read.totalSupply()).to.equal(BigInt(0));
      expect(await vault.read.totalAssets()).to.equal(BigInt(0));

      const hash = await vault.write.processDeposits([BigInt(1)], {
        account: owner.account,
      });

      expect(await vault.read.pendingDeposits()).to.deep.equal([]);

      expect(await vault.read.totalAssets()).to.equal(toBN(10_000, 6));
      expect(await vault.read.totalSupply()).to.equal(toBN(10_000, 18));

      expect(await vault.read.balanceOf([user.account.address])).to.equal(
        toBN(10_000, 18),
      );

      expect(await getEmittedEvent(hash, vault.abi, "Deposit")).to.deep.equal({
        sender: getAddress(user.account.address),
        owner: getAddress(user.account.address),
        assets: toBN(10_000, 6),
        shares: toBN(10_000, 18),
      });
    });
  });

  describe("Redeem", function () {
    it("Can queue user redeem", async function () {
      const { vault, usdt, user } = await loadFixture(fixtureWithDeposit);

      await expect(
        usdt.read.balanceOf([user.account.address]),
      ).to.eventually.equal(toBN(90_000, 6));
      expect(await vault.read.balanceOf([user.account.address])).to.equal(
        toBN(10_000, 18),
      );
      expect(await vault.read.totalSupply()).to.equal(toBN(10_000, 18));

      await vault.write.redeem(
        [toBN(10_000, 18), user.account.address, user.account.address],
        {
          account: user.account,
        },
      );

      // Expect LP tokens to be transfered to contract, but no change in usdt balance
      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(90_000, 6),
      );
      expect(await vault.read.balanceOf([user.account.address])).to.equal(
        toBN(0, 18),
      );
      expect(await vault.read.balanceOf([vault.address])).to.equal(
        toBN(10_000, 18),
      );
      expect(await vault.read.totalSupply()).to.equal(toBN(10_000, 18));

      expect(await vault.read.pendingRedeems()).to.deep.equal([
        {
          caller: getAddress(user.account.address),
          owner: getAddress(user.account.address),
          receiver: getAddress(user.account.address),
          shares: toBN(10_000, 18),
          timestamp: await time.latest(),
        },
      ]);
    });

    it("Can process redeem", async () => {
      const { vault, usdt, user, owner } = await loadFixture(
        fixtureWithPendingRedeem,
      );

      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        toBN(10_000, 6),
      );
      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(90_000, 6),
      );
      expect(await vault.read.pendingRedeems()).to.deep.equal([
        {
          caller: getAddress(user.account.address),
          owner: getAddress(user.account.address),
          receiver: getAddress(user.account.address),
          shares: toBN(10_000, 18),
          timestamp: await time.latest(),
        },
      ]);
      expect(await vault.read.totalAssets()).to.equal(toBN(10_000, 6));
      expect(await vault.read.totalSupply()).to.equal(toBN(10_000, 18));

      await usdt.write.approve([vault.address, toBN(10_000, 6)], {
        account: owner.account,
      });
      const hash = await vault.write.processRedeems(
        [BigInt(1), toBN(10_000, 6)],
        { account: owner.account },
      );

      expect(await vault.read.pendingRedeems()).to.deep.equal([]);

      expect(await vault.read.totalAssets()).to.equal(toBN(0, 6));
      expect(await vault.read.totalSupply()).to.equal(toBN(0, 18));

      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(100_000, 6),
      );

      expect(await getEmittedEvent(hash, vault.abi, "Withdraw")).to.deep.equal({
        sender: getAddress(user.account.address),
        receiver: getAddress(user.account.address),
        owner: getAddress(user.account.address),
        assets: toBN(10_000, 6),
        shares: toBN(10_000, 18),
      });
    });
  });

  describe("Vault withdrawalToOwner", function () {
    it("Can reject ETH transfers", async function () {
      const { vault, user } = await loadFixture(fixtureNewVault);

      await expect(
        user.sendTransaction({
          to: vault.address,
          value: toBN(1, 18),
        }),
      ).to.eventually.be.rejectedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback nor receive function",
      );
    });

    it("Should allow withdrawal to owner for USDT", async function () {
      const { vault, owner, usdt, user } = await loadFixture(fixtureNewVault);

      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        BigInt(0),
      );

      // Send USDT to vault
      await usdt.write.transfer([vault.address, toBN(5_000, 6)], {
        account: user.account,
      });

      expect(await usdt.read.balanceOf([vault.address])).to.equal(
        toBN(5_000, 6),
      );
      expect(await vault.read.totalAssets()).to.equal(BigInt(0));

      // Withdrawal to owner
      await vault.write.withdrawalToOwner([usdt.address], {
        account: owner.account,
      });

      expect(await usdt.read.balanceOf([vault.address])).to.equal(BigInt(0));
      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        toBN(5_000, 6),
      );
    });
  });
});
