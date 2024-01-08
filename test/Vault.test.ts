import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { getAddress, parseGwei } from "viem";

describe("Vault", function () {
  async function deployVaultFixture() {
    const { deployer } = await hre.getNamedAccounts();

    // await hre.deployments.fixture(['Vault']);

    // const Vault = await hre.deployments.get('Vault');
    // const vault = await hre.viem.getContractAt('Vault', Vault.address);
    const vault = await hre.viem.deployContract("Vault", [
      "Vault",
      "BLT",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    ]);

    return {
      vault,
      deployer: deployer as `0x${string}`,
    };
  }
  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);
      expect(await vault.read.name()).to.equal("Vault");
      expect(await vault.read.symbol()).to.equal("BLT");
    });
    it("Should set the right asset", async function () {});

    it("Should set the right owner", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);

      expect(await vault.read.owner()).to.equal(getAddress(deployer));
    });
  });

  describe("Deposit", function () {
    it("Should deposit", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);

      await vault.write.deposit([BigInt("1000"), deployer]);
      await vault.write.deposit([BigInt("2000"), deployer]);
      await vault.write.deposit([BigInt("3000"), deployer]);
      await vault.write.deposit([BigInt("4000"), deployer]);

      console.log(await vault.read.depositQueue());
    });
  });
});
