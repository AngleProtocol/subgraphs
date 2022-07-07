Angle subgraph

yarn graph create --node http://localhost:8020/ angle/sub
yarn deploy-local

http://localhost:8000/subgraphs/name/angle/sub

## Perpetual

The perpetual subgraph tracks the states of each perpetual (NFT) as well as all transactions related to it. It is also accountable for keepers transaction on perpetuals: liquidation and force close event.
