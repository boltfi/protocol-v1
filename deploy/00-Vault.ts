import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, catchUnknownSigner } = deployments;

  const { deployer, usdt, owner } = await getNamedAccounts();

  const asset = network.live
    ? usdt
    : (await deployments.get("MockUSDT")).address;

  const args = [
    "Vault", // Name
    "BLT", // Symbol
    asset, // Asset,
    owner, // Owner
  ];
  // We don't have the owner key, need to do manually
  await catchUnknownSigner(
    deploy("Vault", {
      from: deployer,
      proxy: {
        proxyContract: "UUPS",
        owner,
        execute: {
          init: {
            methodName: "initialize",
            args,
          },
        },
      },
      log: true,
    }),
  );
};

func.tags = ["Vault"];
func.dependencies = ["MockUSDT"]; // this ensure the Token script above is executed first, so `deployments.get('Token')` succeeds

export default func;
