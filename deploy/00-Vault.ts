import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const [, owner] = await hre.viem.getWalletClients();

  const asset = await deployments.get("MockUSDT");

  await deploy("Vault", {
    from: deployer,
    proxy: {
      proxyContract: 'UUPS',
      // proxyArgs: ['{implementation}', '{data}'],
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            "Vault",
            "BLT",
            asset.address,
            owner.account.address,
          ],
        },
      }
    },
    log: true,
  });
};

func.tags = ["Vault"];
func.dependencies = ['MockUSDT']; // this ensure the Token script above is executed first, so `deployments.get('Token')` succeeds


export default func;
