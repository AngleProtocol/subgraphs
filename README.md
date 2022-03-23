Angle subgraphs

To run a graph-node locally in Docker: start docker deamon on your system and run:
`docker-compose up`
You can then deploy your subgraphs using `yarn create-local && yarn deploy-local`
When you're done, don't forget to clean up: `docker-compose down && rm -rf data`
