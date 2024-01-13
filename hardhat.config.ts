import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-deploy";
import 'solidity-docgen';
import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  docgen: {
    pages: 'files',
    exclude: ['MockUSDT.sol']
  },
  namedAccounts: {
    deployer: 0,
    tokenOwner: 1,
  },
};

export default config;
