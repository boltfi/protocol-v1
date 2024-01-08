import 'hardhat-deploy';
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  namedAccounts: {
    deployer: 0,
    tokenOwner: 1,
  }
};

export default config;
