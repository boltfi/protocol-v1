import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import hre, { getNamedAccounts } from "hardhat";
import { getAddress, parseGwei } from "viem";

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
      deployer: deployer.account.address,
      user,
      usdt,
      owner: owner,
    };
  }
  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);
      expect(await vault.read.name()).to.equal("Vault");
      expect(await vault.read.symbol()).to.equal("BLT");
    });

    it("Should set the right asset");

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

  const toBN = (n: number) => BigInt(n) * BigInt(10 ** 6);

  describe("Deposit", function () {
    it("Should deposit", async function () {
      const { vault, deployer, usdt, user, owner } =
        await loadFixture(deployVaultFixture);

      expect(await usdt.read.balanceOf([user.account.address])).to.equal(
        toBN(100_000),
      );

      await usdt.write.approve([vault.address, toBN(10_000)], {
        account: user.account,
      });

      await vault.write.deposit([BigInt(toBN(10_000)), user.account.address], {
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
          assets: toBN(10_000),
          timestamp: await time.latest(),
        },
      ]);
    });
  });
});
