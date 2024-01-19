import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments } = hre as any;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("MockUSDT", {
    args: [],
    contract: "MockUSDT",
    from: deployer,
    log: true,
  });
};

// Only deploy locally
func.skip = async ({ network }) => network.live;

func.tags = ["MockUSDT"];
export default func;
