import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getAddress } from "viem";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getNamedAccounts } = hre;

  const { owner } = await getNamedAccounts();
  const users = (await getUnnamedAccounts()).slice(0, 5);

  const USDT = await deployments.get("MockUSDT");
  const usdt = await hre.viem.getContractAt(
    "MockUSDT",
    getAddress(USDT.address),
  );
  // const Vault = await deployments.get("Vault");
  // const vault = await hre.viem.getContractAt(
  //   "Vault",
  //   getAddress(vault.address),
  // );

  const addresses = [owner, ...users];

  // console.log("Minting USDT to: ", addresses);
  await Promise.all(
    addresses.map((address) =>
      usdt.write.mint([getAddress(address), BigInt(1_000_000 * 10 ** 6)]),
    ),
  );
};

// Only deploy on hardhat network
func.skip = async ({ network }) => network.name !== "hardhat";

export default func;
