import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments } = hre as any;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('MockUSDT', {
    args: [],
    contract: "MockUSDT",
    from: deployer,
    log: true,
  });
};


// Only deploy locally
func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const network = hre.network.name;
  if (["localhost", "hardhat"].includes(network)) {
    return false;
  }
  return true;
};

func.tags = ["MockUSDT"];
export default func;
