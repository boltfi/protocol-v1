import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("Vault", {
    from: deployer,
    args: ["Vault", "BLT", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", deployer],
    log: true,
  });
};

func.tags = ["Vault"];

export default func;
