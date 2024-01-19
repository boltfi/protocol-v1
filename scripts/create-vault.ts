import hre from "hardhat";

async function main() {
  const { deployments, ethers, upgrades, getNamedAccounts, network } = hre;

  const { deployer, usdt, owner } = await getNamedAccounts();
  const asset = network.live
    ? usdt
    : (await deployments.get("MockUSDT")).address;

  const args = [
    "Vault", // Name
    "BLT", // Symbol
    asset, // Asset,
    owner, // Owner
  ];
  console.log(args);
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await upgrades.deployProxy(Vault, args, {
    redeployImplementation: "onchange",
    // useDefenderDeploy: true,
  });
  await vault.waitForDeployment();
  console.log("Vault deployed to:", await vault.getAddress());
}

main();
