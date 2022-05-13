# Angle subgraphs

To run a graph-node locally in Docker: start docker deamon on your system and run:
`docker-compose up`
You can then deploy your subgraphs using `yarn create-local && yarn deploy-local`
When you're done, don't forget to clean up: `docker-compose down && rm -rf data`

## Developpment setup

The following procedure will allow you to fork a remote network like Rinkeby or Mainnet, to make some local changes to it and then index it with a local graph-node instance.
This is very convenient to debug your subgraph with real network state without the latency and cost of making real transactions.

First, fork a remote network with hardhat:
```
FORK=true yarn hardhat node --tags none --hostname 0.0.0.0
```

Run any script you want on this local fork to update its state, e.g:
```
yarn hardhat run myScript.ts --network localhost
```

Point the ethereum RPC parameter in `docker-compose.yml` to localhost, e.g:

`ethereum: 'rinkeby:http://host.docker.internal:8545'`

Kill, clean and relaunch graph-node containers via `docker-compose`:
```
sudo docker-compose down && sudo rm -rf data && sudo docker-compose up
```

Upload a subgraph to your node, e.g:
```
cd angle-subgraph-borrow
yarn create-local && yarn deploy-local:rinkeby
```

That's it, you can now make queries to your subgraph.
A visual tool is available at http://localhost:8000/subgraphs/name/angle/sub/graphql

## Fast Sync
The borrow subgraph has the particularity of updating its entities on every oracle price update. This can be disabled to decrease crash recovery time by setting `FAST_SYNC_THRESHOLD` to a recent date in `constants.ts`.
Oracle updates happening before this timestamp will be sampled to compute at most 1 oracle-induced refresh every 3 hours.
Updates happening above this timestamp will be processed normally.
Once crash is recovered, `FAST_SYNC_THRESHOLD` can be set back to `0`, and slower indexing can be relaunched in background to get better historical data.