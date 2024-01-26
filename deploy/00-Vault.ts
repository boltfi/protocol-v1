import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { save } = deployments;

  const { owner } = await getNamedAccounts();

  const asset = (await deployments.get("MockUSDT")).address;

  const args = [
    "Vault", // Name
    "BLT", // Symbol
    asset, // Asset,
    owner, // Owner
  ];

  // Use openzeppelin deploy proxy to match production
  const Vault = await hre.ethers.getContractFactory("Vault");
  const vault = await hre.upgrades.deployProxy(Vault, args, {
    kind: "uups",
    redeployImplementation: "onchange",
    useDefenderDeploy: false,
  });
  await vault.waitForDeployment();

  // Save the deployed contract back into hardhat-deploy to take advantage
  // of automatic deployment
  const address = await vault.getAddress();
  const artifact = await deployments.getArtifact("Vault");
  await save("Vault", { address, abi: artifact.abi });
  console.log(`Deployed vault to ${address}`);
};

// Only use this for local deployments
func.skip = async ({ network }) => network.live;
func.tags = ["Vault"];
func.dependencies = ["MockUSDT"]; // this ensure the Token script above is executed first, so `deployments.get('Token')` succeeds

export default func;
