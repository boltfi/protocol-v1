import readline from "node:readline/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function prompt(message: string): Promise<void> {
  const answer = await rl.question(`${message} (y/n)`);
  if (answer !== "y") {
    console.log("Aborting");
    process.exit(1);
  }
  return;
}

export function getExplorerLinkForAddress(
  networkName: string,
  address: string,
): string {
  switch (networkName) {
    case "sepolia":
      return `https://sepolia.etherscan.io/address/${address}`;
    default:
      return address;
  }
}
