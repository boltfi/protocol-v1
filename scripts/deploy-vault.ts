import { getExplorerLinkForAddress, prompt } from "./utils";
import hre from "hardhat";

async function main() {
  const { deployments, ethers, getNamedAccounts, network, defender } = hre;
  const { usdt, owner } = await getNamedAccounts();

  // Only use mock USDT on local network
  const asset = network.live
    ? usdt
    : (await deployments.get("MockUSDT")).address;

  const name = "Boltfi.io USDT Funding 1";
  const symbol = "bv-Bolt-USDT-Funding-1";

  console.log(`Name  : ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Asset : ${getExplorerLinkForAddress(network.name, asset)}`);
  console.log(`Owner : ${getExplorerLinkForAddress(network.name, owner)}`);
  await prompt("Proceed with deployment?");

  const args = [name, symbol, asset, owner];
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await defender.deployProxy(Vault, args, {
    kind: "uups",
    redeployImplementation: "onchange",
  });
  await vault.waitForDeployment();
  console.log("Vault Proxy deployed to:", await vault.getAddress());
}

main();
