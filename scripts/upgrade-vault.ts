import { getExplorerLinkForAddress, prompt } from "./utils";
import hre from "hardhat";

const proxy = "0x1342e5dEF25ca8d0Ae91C3fF50d1281Aa9795801";

async function main() {
  const { ethers, network, defender } = hre;
  const Vault = await ethers.getContractFactory("Vault");

  console.log(`Proxy : ${getExplorerLinkForAddress(network.name, proxy)}`);
  await prompt("Proceed with Upgrade?");
  const proposal = await defender.proposeUpgradeWithApproval(proxy, Vault);

  console.log(`Upgrade proposed with URL: ${proposal.url}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
