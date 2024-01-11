import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import hre, { getNamedAccounts } from "hardhat";
import { get } from "http";
import { getAddress, parseGwei, parseEven, decodeEventLog } from "viem";

chai.use(chaiAsPromised);
describe("Vault", function () {
  async function deployVaultFixture() {
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
  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      expect(await vault.read.name()).to.equal("Vault");
      expect(await vault.read.symbol()).to.equal("BLT");
    });

    it("Should set the right asset");

    it("Sets the correct initial price", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      expect(await vault.read.price()).to.equal(BigInt(0));
      expect(await vault.read.priceUpdatedAt()).to.equal(BigInt(0));
    });
    it("Sets the correct initial withdrawal fee", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      expect(await vault.read.withdrawalFee()).to.equal(BigInt(0));
    });

    it("Should set the right owner", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);

      expect(await vault.read.owner()).to.equal(
        getAddress(owner.account.address),
      );
    });
  });

  describe("Price management", function () {
    it("Owner can update price", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);
      const price = BigInt(10 ** 6);
      await vault.write.updatePrice([price], {
        account: owner.account,
      });

      const now = await time.latest();
      expect(await vault.read.price()).to.equal(price);
      expect(await vault.read.priceUpdatedAt()).to.equal(BigInt(now));
    });

    it("Deployer cannot update the price", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);
      await expect(
        vault.write.updatePrice([BigInt(10 ** 6)], {
          account: deployer.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Users cannot update the price", async function () {
      const { vault, user } = await loadFixture(deployVaultFixture);
      await expect(
        vault.write.updatePrice([BigInt(10 ** 6)], {
          account: user.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });
  });

  describe("Withdrawal Fee management", function () {
    it("Owner can update withdrawal fee", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);
      const withdrawalFee = BigInt(10 ** 6);
      await vault.write.updateWithdrawalFee([withdrawalFee], {
        account: owner.account,
      });
      expect(await vault.read.withdrawalFee()).to.equal(withdrawalFee);
    });

    it("Deployer cannot update the withdrawal fee", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);
      await expect(
        vault.write.updateWithdrawalFee([BigInt(10 ** 6)], {
          account: deployer.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Users cannot update the withdrawal fee", async function () {
      const { vault, user } = await loadFixture(deployVaultFixture);
      await expect(
        vault.write.updateWithdrawalFee([BigInt(10 ** 6)], {
          account: user.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });
  });

  const toBN = (n: number, decimals = 6) => BigInt(n) * BigInt(10 ** decimals);

  describe("Queue Deposit", function () {
    it("Can queue user deposit", async function () {
      const { vault, usdt, user, owner } =
        await loadFixture(deployVaultFixture);

      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(100_000),
      );

      await usdt.write.approve([vault.address, toBN(10_000)], {
        account: user.account,
      });

      await vault.write.deposit([toBN(10_000), user.account.address], {
        account: user.account,
      });

      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(90_000),
      );

      expect(await usdt.read.balanceOf([vault.address])).to.equal(toBN(0));
      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        toBN(10_000),
      );

      expect(await vault.read.depositQueue()).to.deep.equal([
        {
          sender: getAddress(user.account.address),
          receiver: getAddress(user.account.address),
          amount: toBN(10_000),
          timestamp: await time.latest(),
        },
      ]);
    });
  });

  describe("Process Deposit", function () {
    async function depositedVaultFixture() {
      const deployment = await loadFixture(deployVaultFixture);

      const { vault, user, usdt } = await loadFixture(deployVaultFixture);

      await usdt.write.approve([vault.address, toBN(10_000)], {
        account: user.account,
      });

      await vault.write.deposit([toBN(10_000), user.account.address], {
        account: user.account,
      });

      return deployment;
    }

    it("Can reject when price is outdated", async function () {
      const { vault, owner } = await loadFixture(depositedVaultFixture);
      await expect(
        vault.write.processDeposits([BigInt(1)], {
          account: owner.account,
        }),
      ).to.eventually.be.rejectedWith("Price is outdated");
    });

    it("Can reject when user ", async function () {
      const { vault, owner, user } = await loadFixture(depositedVaultFixture);
      await vault.write.updatePrice([BigInt(10 ** (18 - 6))], {
        account: owner.account,
      });
      await expect(
        vault.write.processDeposits([BigInt(1)], {
          account: user.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    async function getEmittedEvent(hash: `0x${string}`, abi: any, eventName: string) {
      const publicClient = await hre.viem.getPublicClient();
      const { logs } = await publicClient.getTransactionReceipt({ hash });
      for (let log of logs) {

        const event = decodeEventLog({ abi, data: log.data, topics: log.topics })
        if (event.eventName === eventName) {
          return event.args
        }
      }
      return {}
    }

    it("Can process queued deposits", async function () {
      const { vault, usdt, user, owner } = await loadFixture(
        depositedVaultFixture,
      );

      expect(await vault.read.depositQueue()).to.deep.equal([
        {
          sender: getAddress(user.account.address),
          receiver: getAddress(user.account.address),
          amount: toBN(10_000, 6),
          timestamp: await time.latest(),
        },
      ]);
      await vault.write.updatePrice([BigInt(10 ** (18 - 6))], {
        account: owner.account,
      });

      expect(await vault.read.totalSupply()).to.equal(BigInt(0));
      expect(await vault.read.totalAssets()).to.equal(BigInt(0));

      const hash = await vault.write.processDeposits([BigInt(1)],
        { account: owner.account });


      expect(await vault.read.depositQueue()).to.deep.equal([]);

      expect(await vault.read.totalAssets()).to.equal(
        toBN(10_000, 6),
      );
      expect(await vault.read.totalSupply()).to.equal(
        toBN(10_000, 18),
      );

      expect(await vault.read.balanceOf([user.account.address])).to.equal(
        toBN(10_000, 18),
      );

      expect(await getEmittedEvent(hash, vault.abi, "Deposit")).to.deep.equal({
        sender: getAddress(user.account.address),
        owner: getAddress(user.account.address),
        assets: toBN(10_000, 6),
        shares: toBN(10_000, 18),
      })
    });
  });
});
