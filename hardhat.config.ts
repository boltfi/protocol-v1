import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-deploy";
import { HardhatUserConfig } from "hardhat/config";
import "solidity-docgen";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  docgen: {
    pages: "files",
    exclude: [],
  },
  namedAccounts: {
    deployer: 0,
    tokenOwner: 1,
  },
};

export default config;
