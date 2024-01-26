NETWORK="arbitrumOne"

function deploy {
  npm run hardhat -- --network $NETWORK run ./scripts/deploy-vault.ts 
}

function upgrade {
  npm run hardhat -- --network $NETWORK run ./scripts/update-vault.ts 
}

function verify() {
    ADDRESS=$1
    npx hardhat verify --network $NETWORK $ADDRESS 
}

${@}