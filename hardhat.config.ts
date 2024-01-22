import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";
import "hardhat-deploy";
import "solidity-docgen";

const config = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defender: {
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    useDefenderDeploy: true,
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
      sepolia: "0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0",
    },
    owner: {
      default: 1,
      arbitrumSepolia: `${process.env.OWNER_PUBLIC_KEY}`,
      sepolia: "0x86050D67dE08714AB8320469C4019bc1dd26bCF0",
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
    sepolia: {
      url: "https://ethereum-sepolia.publicnode.com",
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: `${process.env.ETHERSCAN_API_KEY}`,
  },
  verify: {
    etherscan: {
      apiKey: `${process.env.ARBISCAN_API_KEY}`,
    },
  },
};

export default config;
