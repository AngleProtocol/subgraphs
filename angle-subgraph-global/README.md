Angle subgraph

yarn graph create --node http://localhost:8020/ angle/sub
yarn deploy-local

http://localhost:8000/subgraphs/name/angle/sub

## Transaction

The transaction subgraph tracks general info on the core module. It fetches stablecoins and pool managers metrics, as well as all transactions on the core module. For redundancy it also tracks perpetuals info, that you can also find in the `angle-subgraph-perpetual`
