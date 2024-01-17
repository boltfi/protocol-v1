import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import hre from "hardhat";
import { decodeEventLog, getAddress } from "viem";

// TODO:- Add test for only processing 1 deposit in queue
// TODO:- Add test for only processing 1 redeem in queue

chai.use(chaiAsPromised);
const toBN = (n: number, decimals = 6) => BigInt(n * 10 ** decimals);
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
  const [deployer, owner, userA, userB, userC] = await hre.viem.getWalletClients();


  const usdt = await hre.viem.deployContract("MockUSDT");
  await usdt.write.mint([
    userA.account.address,
    BigInt(100_000) * BigInt(10 ** 6),
  ]);
  await usdt.write.mint([
    userB.account.address,
    BigInt(100_000) * BigInt(10 ** 6),
  ]);
  await usdt.write.mint([
    userC.account.address,
    BigInt(100_000) * BigInt(10 ** 6),
  ]);

  // Vault deployed is last transaction so timestamps can be tested
  const vault = await hre.viem.deployContract("Vault", [
    "Vault",
    "BLT",
    usdt.address,
    owner.account.address,
  ]);



  return {
    vault,
    deployer,
    userA,
    userB,
    userC,
    usdt,
    owner: owner,
  };
}

async function fixtureWithPendingDeposit() {
  const deployment = await loadFixture(fixtureNewVault);
  const { vault, userA, usdt } = deployment;

  // Add some time
  await time.increase(2 * ONE_DAY);

  await usdt.write.approve([vault.address, toBN(10_000, 6)], {
    account: userA.account,
  });

  await vault.write.deposit([toBN(10_000, 6), userA.account.address], {
    account: userA.account,
  });

  return deployment;
}

async function fixtureWithDeposit() {
  const deployment = await loadFixture(fixtureWithPendingDeposit);


  const { vault, owner } = deployment;

  await vault.write.updatePrice([toBN(1.25, 18)], {
    account: owner.account,
  });

  expect(await vault.read.totalSupply()).to.equal(BigInt(0));
  expect(await vault.read.totalAssets()).to.equal(BigInt(0));

  await vault.write.processDeposits([BigInt(1)], { account: owner.account });

  return deployment;
}

async function fixtureWithPendingRedeem() {
  const deployment = await loadFixture(fixtureWithDeposit);
  const { vault, userA } = deployment;

  await vault.write.redeem(
    [toBN(8_000, 6), userA.account.address, userA.account.address],
    {
      account: userA.account,
    },
  );

  return deployment;
}
describe("Vault Unit tests", function () {

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

    it("Should set the right decimals", async function () {
      const { vault, usdt } = await loadFixture(fixtureNewVault);
      const decimals = await vault.read.decimals();
      expect(decimals).to.equal(6);
      expect(decimals).to.equal(await usdt.read.decimals());
    });

    it("Should set the right owner", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);

      expect(await vault.read.owner()).to.equal(
        getAddress(owner.account.address),
      );
    });

    it("Sets the correct initial price", async function () {
      const { vault } = await loadFixture(fixtureNewVault);
      expect(await vault.read.price()).to.equal(toBN(1, 18));
      expect(await vault.read.priceUpdatedAt()).to.equal(await time.latest());
    });

    it("Sets the correct initial withdrawal fee", async function () {
      const { vault } = await loadFixture(fixtureNewVault);
      expect(await vault.read.withdrawalFee()).to.equal(BigInt(0));
    });
  });

  describe("Ownership", function () {
    it("Can change owner", async function () {
      const { vault, owner, userA } = await loadFixture(fixtureNewVault);
      await vault.write.transferOwnership([userA.account.address], {
        account: owner.account,
      });

      expect(await vault.read.owner()).to.equal(
        getAddress(userA.account.address),
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
      const { vault, userA } = await loadFixture(fixtureNewVault);
      expect(await vault.read.paused()).to.equal(false);
      await expect(
        vault.write.pause({ account: userA.account }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Can be paused by owner", async function () {
      const { vault, owner, userA } = await loadFixture(fixtureNewVault);
      expect(await vault.read.paused()).to.equal(false);
      await vault.write.pause({ account: owner.account });
      expect(await vault.read.paused()).to.equal(true);
    });

    it("Can rejects user actions when paused", async function () {
      const { vault, owner, userA } = await loadFixture(fixtureNewVault);
      await vault.write.pause({ account: owner.account });

      await expect(
        vault.write.deposit(
          [toBN(10_000, 6), getAddress(userA.account.address)],
          { account: userA.account },
        ),
      ).to.eventually.be.rejectedWith("EnforcedPause");

      await expect(
        vault.write.redeem(
          [
            toBN(10_000, 6),
            getAddress(userA.account.address),
            getAddress(userA.account.address),
          ],
          { account: userA.account },
        ),
      ).to.eventually.be.rejectedWith("EnforcedPause");
    });
  });

  describe("Price conversion", function () {
    it("Can convert from shares to assets", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);

      await vault.write.updatePrice([toBN(2, 18)], {
        account: owner.account,
      });

      expect(await vault.read.convertToAssets([toBN(1, 6)])).to.equal(
        toBN(2, 6)
      );
    });

    it("Can convert from assets to shares", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);

      await vault.write.updatePrice([toBN(2, 18)], {
        account: owner.account,
      });

      expect(await vault.read.convertToShares([toBN(1, 6)])).to.equal(
        toBN(0.5, 6)
      );
    });

    it("Can round down in conversion from assets to shares", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);

      await vault.write.updatePrice([toBN(1.8, 18)], {
        account: owner.account,
      });

      expect(await vault.read.convertToShares([toBN(10 ** 6, 6)])).to.equal(
        BigInt("555555555555"),
      );
    });

    it("Can round down in conversion from shares to assets", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);

      await vault.write.updatePrice([BigInt("199999999999999999")], {
        account: owner.account,
      });

      expect(await vault.read.convertToAssets([toBN(1, 6)])).to.equal(
        BigInt("199999"),
      );
    });
  });

  describe("Price management", function () {
    it("Owner can update price", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);
      const price = toBN(1, 18);
      const hash = await vault.write.updatePrice([price], {
        account: owner.account,
      });

      const now = await time.latest();
      expect(await vault.read.price()).to.equal(price);
      expect(await vault.read.priceUpdatedAt()).to.equal(now);

      expect(
        await getEmittedEvent(hash, vault.abi, "PriceUpdate"),
      ).to.deep.equal({
        price,
      });
    });

    it("Deployer cannot update the price", async function () {
      const { vault, deployer } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updatePrice([toBN(1, 18)], {
          account: deployer.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Users cannot update the price", async function () {
      const { vault, userA } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updatePrice([toBN(1, 18)], {
          account: userA.account,
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
      const { vault, userA } = await loadFixture(fixtureNewVault);
      await expect(
        vault.write.updateWithdrawalFee([BigInt(10 ** 6)], {
          account: userA.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });
  });


  describe("Deposit", function () {
    it("Can previewDeposit", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);
      expect(await vault.read.previewDeposit([toBN(10_000, 6)])).to.equal(toBN(10_000, 6));

    });

    it("Can queue user deposit", async function () {
      const { vault, usdt, userA, owner } = await loadFixture(fixtureNewVault);

      expect(await usdt.read.balanceOf([userA.account.address])).to.equal(
        toBN(100_000, 6),
      );

      await usdt.write.approve([vault.address, toBN(10_000, 6)], {
        account: userA.account,
      });

      await vault.write.deposit([toBN(10_000, 6), userA.account.address], {
        account: userA.account,
      });

      // Expect the usdt to be transferred to the vault owner, no shares issued
      expect(await usdt.read.balanceOf([userA.account.address])).to.equal(
        toBN(90_000, 6),
      );
      expect(await usdt.read.balanceOf([vault.address])).to.equal(toBN(0, 6));
      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        toBN(10_000, 6),
      );
      expect(await vault.read.balanceOf([userA.account.address])).to.equal(
        toBN(0, 6),
      );

      expect(await vault.read.pendingDeposits()).to.deep.equal([
        {
          sender: getAddress(userA.account.address),
          receiver: getAddress(userA.account.address),
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
      const { vault, owner, userA } = await loadFixture(
        fixtureWithPendingDeposit,
      );
      await vault.write.updatePrice([toBN(1, 18)], {
        account: owner.account,
      });
      await expect(
        vault.write.processDeposits([BigInt(1)], {
          account: userA.account,
        }),
      ).to.eventually.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Can preview process deposits", async function () {
      const { vault, owner } = await loadFixture(
        fixtureWithPendingDeposit,
      );

      const queue = await vault.read.pendingDeposits()
      await vault.write.updatePrice([toBN(1.25, 18)], {
        account: owner.account,
      });

      expect(await vault.read.previewProcessDeposits([BigInt(1)])).to.deep.equal([toBN(10_000, 6), toBN(8_000, 6)]);

      expect(await vault.read.pendingDeposits()).to.deep.equal(queue);
    });

    it("Can process queued deposits", async function () {
      const { vault, usdt, userA, owner } = await loadFixture(
        fixtureWithPendingDeposit,
      );

      expect(await vault.read.pendingDeposits()).to.deep.equal([
        {
          sender: getAddress(userA.account.address),
          receiver: getAddress(userA.account.address),
          assets: toBN(10_000, 6),
          timestamp: await time.latest(),
        },
      ]);
      await vault.write.updatePrice([toBN(1.25, 18)], {
        account: owner.account,
      });

      expect(await vault.read.totalSupply()).to.equal(BigInt(0));
      expect(await vault.read.totalAssets()).to.equal(BigInt(0));

      const hash = await vault.write.processDeposits([BigInt(1)], {
        account: owner.account,
      });

      expect(await vault.read.pendingDeposits()).to.deep.equal([]);

      expect(await vault.read.totalAssets()).to.equal(toBN(10_000, 6));
      expect(await vault.read.totalSupply()).to.equal(toBN(8_000, 6));

      expect(await vault.read.balanceOf([userA.account.address])).to.equal(
        toBN(8_000, 6),
      );

      expect(await getEmittedEvent(hash, vault.abi, "Deposit")).to.deep.equal({
        sender: getAddress(userA.account.address),
        owner: getAddress(userA.account.address),
        assets: toBN(10_000, 6),
        shares: toBN(8_000, 6),
      });
    });
  });

  describe("Redeem", function () {
    it("Can preview Redeem with no withdrawal fee", async function () {
      const { vault } = await loadFixture(fixtureNewVault);
      expect(await vault.read.previewRedeem([toBN(10_000, 6)])).to.equal(toBN(10_000, 6));
    });

    it("Can preview Redeem with withdrawal fee", async function () {
      const { vault, owner } = await loadFixture(fixtureNewVault);
      await vault.write.updateWithdrawalFee([BigInt(0.01 * 10 ** 6)], {
        account: owner.account,
      });
      expect(await vault.read.previewRedeem([toBN(10_000, 6)])).to.equal(toBN(9_900, 6));
    });

    it("Can queue user redeem", async function () {
      const { vault, usdt, userA } = await loadFixture(fixtureWithDeposit);

      await expect(
        usdt.read.balanceOf([userA.account.address]),
      ).to.eventually.equal(toBN(90_000, 6));

      expect(await vault.read.balanceOf([userA.account.address])).to.equal(
        toBN(8_000, 6),
      );
      expect(await vault.read.totalSupply()).to.equal(toBN(8_000, 6));

      await vault.write.redeem(
        [toBN(8_000, 6), userA.account.address, userA.account.address],
        {
          account: userA.account,
        },
      );

      // Expect LP tokens to be transfered to contract, but no change in usdt balance
      expect(await usdt.read.balanceOf([userA.account.address])).to.equal(
        toBN(90_000, 6),
      );
      expect(await vault.read.balanceOf([userA.account.address])).to.equal(
        toBN(0, 6),
      );
      expect(await vault.read.balanceOf([vault.address])).to.equal(
        toBN(8_000, 6),
      );
      expect(await vault.read.totalSupply()).to.equal(toBN(8_000, 6));

      expect(await vault.read.pendingRedeems()).to.deep.equal([
        {
          caller: getAddress(userA.account.address),
          owner: getAddress(userA.account.address),
          receiver: getAddress(userA.account.address),
          shares: toBN(8_000, 6),
          timestamp: await time.latest(),
        },
      ]);
    });

    it("Can preview process redeem with no withdrawal fee", async () => {
      const { vault, usdt, userA, owner } = await loadFixture(
        fixtureWithPendingRedeem,
      );
      const queue = await vault.read.pendingRedeems()

      expect(await vault.read.previewProcessRedeems([BigInt(1)])).to.deep.equal([toBN(10_000, 6), toBN(8_000, 6), toBN(0, 6)]);

      // Queue is unchanged
      expect(await vault.read.pendingRedeems()).to.deep.equal(queue);
    });

    it("Can preview process redeem with withdrawal fee", async () => {
      const { vault, owner } = await loadFixture(
        fixtureWithPendingRedeem,
      );
      const queue = await vault.read.pendingRedeems()

      await vault.write.updateWithdrawalFee([BigInt(0.01 * 10 ** 6)], {
        account: owner.account,
      });

      expect(await vault.read.previewProcessRedeems([BigInt(1)])).to.deep.equal([toBN(9_900, 6), toBN(8_000, 6), toBN(100, 6)]);

      // Queue is unchanged
      expect(await vault.read.pendingRedeems()).to.deep.equal(queue);
    });

    it("Can process redeem", async () => {
      const { vault, usdt, userA, owner } = await loadFixture(
        fixtureWithPendingRedeem,
      );

      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        toBN(10_000, 6),
      );
      expect(await usdt.read.balanceOf([userA.account.address])).to.equal(
        toBN(90_000, 6),
      );
      expect(await vault.read.pendingRedeems()).to.deep.equal([
        {
          caller: getAddress(userA.account.address),
          owner: getAddress(userA.account.address),
          receiver: getAddress(userA.account.address),
          shares: toBN(8_000, 6),
          timestamp: await time.latest(),
        },
      ]);
      expect(await vault.read.totalAssets()).to.equal(toBN(10_000, 6));
      expect(await vault.read.totalSupply()).to.equal(toBN(8_000, 6));

      await usdt.write.approve([vault.address, toBN(10_000, 6)], {
        account: owner.account,
      });
      const hash = await vault.write.processRedeems(
        [BigInt(1), toBN(10_000, 6)],
        { account: owner.account },
      );

      expect(await vault.read.pendingRedeems()).to.deep.equal([]);

      expect(await vault.read.totalAssets()).to.equal(toBN(0, 6));
      expect(await vault.read.totalSupply()).to.equal(toBN(0, 6));

      expect(await usdt.read.balanceOf([userA.account.address])).to.equal(
        toBN(100_000, 6),
      );

      expect(await getEmittedEvent(hash, vault.abi, "Withdraw")).to.deep.equal({
        sender: getAddress(userA.account.address),
        receiver: getAddress(userA.account.address),
        owner: getAddress(userA.account.address),
        assets: toBN(10_000, 6),
        shares: toBN(8_000, 6),
      });
    });

    it("Can process redeem with withdrawal fee", async () => {
      const { vault, usdt, userA, owner } = await loadFixture(
        fixtureWithPendingRedeem,
      );

      // 1%
      await vault.write.updateWithdrawalFee([BigInt(0.01 * 10 ** 6)], {
        account: owner.account,
      });

      await usdt.write.approve([vault.address, toBN(9_900, 6)], {
        account: owner.account,
      });
      const hash = await vault.write.processRedeems(
        [BigInt(1), toBN(9_900, 6)],
        { account: owner.account },
      );

      expect(await vault.read.pendingRedeems()).to.deep.equal([]);

      expect(await vault.read.totalSupply()).to.equal(toBN(0, 6));

      expect(await usdt.read.balanceOf([userA.account.address])).to.equal(
        toBN(99_900, 6),
      );

      expect(await getEmittedEvent(hash, vault.abi, "Withdraw")).to.deep.equal({
        sender: getAddress(userA.account.address),
        receiver: getAddress(userA.account.address),
        owner: getAddress(userA.account.address),
        assets: toBN(9_900, 6),
        shares: toBN(8_000, 6),
      });
    });
  });

  describe("Vault withdrawalToOwner", function () {
    it("Can reject ETH transfers", async function () {
      const { vault, userA } = await loadFixture(fixtureNewVault);

      await expect(
        userA.sendTransaction({
          to: vault.address,
          value: toBN(1, 18),
        }),
      ).to.eventually.be.rejectedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback nor receive function",
      );
    });

    it("Should allow withdrawal to owner for USDT", async function () {
      const { vault, owner, usdt, userA } = await loadFixture(fixtureNewVault);

      expect(await usdt.read.balanceOf([owner.account.address])).to.equal(
        BigInt(0),
      );

      // Send USDT to vault
      await usdt.write.transfer([vault.address, toBN(5_000, 6)], {
        account: userA.account,
      });

      expect(await usdt.read.balanceOf([vault.address])).to.equal(
        toBN(5_000, 6),
      );

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

const ONE_DAY = 24 * 60 * 60 * 1000;

describe("Vault Integration Tests", function () {
  it("Can deposit on behalf of another user", async function () {
    const { vault, usdt, owner, userA, userB } = await loadFixture(fixtureNewVault);

    // User A deposits 10_000 USDT for User B
    await usdt.write.approve([vault.address, toBN(10_000, 6)], {
      account: userA.account,
    });
    await vault.write.deposit([toBN(10_000, 6), userB.account.address], { account: userA.account })

    expect(await usdt.read.balanceOf([userA.account.address])).to.equal(toBN(90_000, 6));
    expect(await usdt.read.balanceOf([owner.account.address])).to.equal(toBN(10_000, 6));

    expect(await vault.read.balanceOf([userA.account.address])).to.equal(toBN(0, 6));
    expect(await vault.read.balanceOf([userB.account.address])).to.equal(toBN(0, 6));

    expect(await vault.read.totalAssets()).to.equal(toBN(0, 6));
    expect(await vault.read.totalSupply()).to.equal(toBN(0, 6));

    // Owner updates price and processes deposits
    await vault.write.updatePrice([toBN(1, 18)], { account: owner.account });
    await vault.write.processDeposits([BigInt(1)], { account: owner.account });

    expect(await vault.read.balanceOf([userA.account.address])).to.equal(toBN(0, 6));
    expect(await vault.read.balanceOf([userB.account.address])).to.equal(toBN(10_000, 6));
    expect(await vault.read.totalAssets()).to.equal(toBN(10_000, 6));
    expect(await vault.read.totalSupply()).to.equal(toBN(10_000, 6));
  });

  it("Can withdrawal on behalf of other user", async function () {
    const { vault, usdt, owner, userA, userB } = await loadFixture(fixtureWithDeposit);

    // User B will make the call
    await vault.write.approve([userB.account.address, toBN(8_000, 6)], { account: userA.account });
    await vault.write.redeem([toBN(8_000, 6), userA.account.address, userA.account.address], { account: userB.account });

    await usdt.write.approve([vault.address, toBN(10_000, 6)], { account: owner.account });
    await vault.write.processRedeems([BigInt(1), toBN(10_000, 6)], { account: owner.account });

    expect(await usdt.read.balanceOf([userA.account.address])).to.equal(toBN(100_000, 6));
    expect(await usdt.read.balanceOf([userB.account.address])).to.equal(toBN(100_000, 6));
  });

  it("Can withdrawal to another user", async function () {
    const { vault, usdt, owner, userA, userB } = await loadFixture(fixtureWithDeposit);

    // User A withdrawals but sends to User B
    await vault.write.redeem([toBN(8_000, 6), userB.account.address, userA.account.address], { account: userA.account });

    await usdt.write.approve([vault.address, toBN(10_000, 6)], { account: owner.account });
    await vault.write.processRedeems([BigInt(1), toBN(10_000, 6)], { account: owner.account });

    expect(await usdt.read.balanceOf([userA.account.address])).to.equal(toBN(90_000, 6));
    expect(await usdt.read.balanceOf([userB.account.address])).to.equal(toBN(110_000, 6));
  });

  it("Profitable vault", async function () {
    const { vault, usdt, owner, userA, userB } = await loadFixture(fixtureNewVault);
    await vault.write.updateWithdrawalFee([BigInt(0.01 * 10 ** 6)], {
      account: owner.account,
    }),

      // User A deposits 10_000 USDT
      await usdt.write.approve([vault.address, toBN(10_000, 6)], {
        account: userA.account,
      });
    await vault.write.deposit([toBN(10_000, 6), userA.account.address], { account: userA.account })

    expect(await usdt.read.balanceOf([userA.account.address])).to.equal(toBN(90_000, 6));
    expect(await usdt.read.balanceOf([owner.account.address])).to.equal(toBN(10_000, 6));

    expect(await vault.read.balanceOf([userA.account.address])).to.equal(toBN(0, 6));

    expect(await vault.read.totalAssets()).to.equal(toBN(0, 6));
    expect(await vault.read.totalSupply()).to.equal(toBN(0, 6));

    // Owner updates price and deposits
    await vault.write.updatePrice([toBN(1, 18)], { account: owner.account });
    await vault.write.processDeposits([BigInt(1)], { account: owner.account });

    expect(await vault.read.balanceOf([userA.account.address])).to.equal(toBN(10_000, 6));
    expect(await vault.read.totalAssets()).to.equal(toBN(10_000, 6));
    expect(await vault.read.totalSupply()).to.equal(toBN(10_000, 6));


    // Some time passes, and user A adds more money, User B also adds money
    await time.increase(7 * ONE_DAY)
    await usdt.write.approve([vault.address, toBN(50_000, 6)], { account: userA.account });
    await vault.write.deposit([toBN(50_000, 6), userA.account.address], { account: userA.account })

    await usdt.write.approve([vault.address, toBN(8_000, 6)], { account: userB.account });
    await vault.write.deposit([toBN(8_000, 6), userB.account.address], { account: userB.account })

    expect(await usdt.read.balanceOf([owner.account.address])).to.equal(toBN(68_000, 6));

    // Means the NAV went from 10_000 to 12_500
    await vault.write.updatePrice([toBN(1.25, 18)], { account: owner.account });
    await vault.write.processDeposits([BigInt(2)], { account: owner.account });

    expect(await vault.read.balanceOf([userA.account.address])).to.equal(toBN(50_000, 6));
    expect(await vault.read.balanceOf([userB.account.address])).to.equal(toBN(6_400, 6));
    expect(await vault.read.totalAssets()).to.equal(toBN(70_500, 6));
    expect(await vault.read.totalSupply()).to.equal(toBN(56_400, 6));

    // Some time passes, user A withdrawals 50% and admin processes
    await time.increase(7 * ONE_DAY)
    await vault.write.redeem([toBN(25_000, 6), userA.account.address, userA.account.address], { account: userA.account });
    expect(await vault.read.totalAssets()).to.equal(toBN(70_500, 6));
    expect(await vault.read.totalSupply()).to.equal(toBN(56_400, 6));

    await vault.write.updatePrice([toBN(1.5, 18)], { account: owner.account });

    await usdt.write.approve([vault.address, toBN(37_125, 6)], { account: owner.account });
    await vault.write.processRedeems([BigInt(1), toBN(37_125, 6)], { account: owner.account });

    expect(await usdt.read.balanceOf([userA.account.address])).to.equal(toBN(77_125, 6));

  });
});
