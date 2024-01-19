import "@nomicfoundation/hardhat-toolbox-viem";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";
import "hardhat-deploy";
import { HardhatUserConfig } from "hardhat/config";
import "solidity-docgen";

const config = {
  solidity: "0.8.20",
  defender: {
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    // useDefenderDeploy: true,
  },
  docgen: {
    pages: "files",
    exclude: [],
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    usdt: {
      arbitrumSepolia: "0xe9318560fF9B5Df59A669A03895effFacF0df8cb",
    },
    owner: {
      default: 1,
      arbitrumSepolia: `${process.env.OWNER_PUBLIC_KEY}`,
    },
  },
  networks: {
    arbitrumSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : undefined,
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia.arbiscan.io",
        },
      },
    },
  },
  verify: {
    etherscan: {
      apiKey: `${process.env.ARBISCAN_API_KEY}`,
    },
  },
};

export default config;
