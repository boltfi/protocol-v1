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
    apiKey: process.env.DEFENDER_API_KEY,
    apiSecret: process.env.DEFENDER_API_SECRET,
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
      // MAINNET
      arbitrumOne: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      // TESTNET
      sepolia: "0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0",
    },
    owner: {
      default: 1,
      // MAINNET
      arbitrumOne: "0x0e9c6D1FF86b695608c5858aF76B2F0E21087d18",
      // TESTNET
      sepolia: "0x86050D67dE08714AB8320469C4019bc1dd26bCF0",
    },
  },
  networks: {
    arbitrumOne: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
    },
    sepolia: {
      url: "https://ethereum-sepolia.publicnode.com",
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      arbitrumOne: `${process.env.ARBISCAN_API_KEY}`,
      sepolia: `${process.env.ETHERSCAN_API_KEY}`,
    },
  },
};

export default config;
