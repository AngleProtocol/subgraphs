Angle subgraph

yarn graph create --node http://localhost:8020/ angle/sub
yarn deploy-local

http://localhost:8000/subgraphs/name/angle/sub

## Token

The token subgraph tracks balances of all tokens (sanTokens, agTokens, ANGLE and veANGLE) on the core module. For an exact balance it also handle internal staking contracts.
