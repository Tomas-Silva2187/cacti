# ZK Provider Tutorial
This package contains proof-of-concept code designed to demonstrate a full
cross-chain asset transfer between Hyperledger Besu and Ethereum using the
Secure Asset Transfer Protocol (SATP) and zkSNARKs.

The following steps explain how to build and execute the different components using docker, and how to prepare them for supporting a full cross-chain asset transfer.

## Prerequisites

Make sure the following tools are installed and available in your `PATH`:

- Docker
- Yarn
- Node.js

Run all commands from the root Cacti repository unless a different directory is
specified.

## 1. Build SATP Hermes

First, follow the build instructions in
[`cactus-plugin-satp-hermes`](../cactus-plugin-satp-hermes/README.md).

Install the project dependencies:

```bash
yarn run configure
```

Then build the SATP Hermes package:

```bash
cd packages/cactus-plugin-satp-hermes
yarn run build
cd ../cacti-plugin-zk-provider
```

## 2. Create the Docker network

From `packages/cacti-plugin-zk-provider`, create a Docker network for
the components:

```bash
yarn run docker-network-setup
```

This creates a network named `zknet`.

## 3. Build the ZK provider (PCU) image

Build the TypeScript output, worker bundles, and Docker image:

```bash
yarn run docker-rebuild
```

The resulting image is named `zkserverv2`.

## 4. Start the provider services

Open five terminal instances. In each terminal, run one of the following
commands:

### Besu PCU

```bash
docker run -p 12802:12802 --name besupcu --network zknet zkserverv2 BESU_PCU
```

### Ethereum PCU

```bash
docker run -p 12801:12801 --name ethpcu --network zknet zkserverv2 ETH_PCU
```

### External server

```bash
docker run -p 12803:12803 --name extserver --network zknet zkserverv2 EXT
```

### Ethereum side credential server

```bash
docker run -p 12804:12804 --name ethcredserver --network zknet zkserverv2 ETH_CRED
```

### Besu side credential server

```bash
docker run -p 12805:12805 --name besucredserver --network zknet zkserverv2 BESU_CRED
```

Keep all five terminals running.
If a container stops or one of the services becomes unresponsive, see
[Instability and recovery](#instability-and-recovery) for instructions to
remove and restart the affected container.

## 5. Compile and publish the ZK credentials

Open another console window and run the command below. This compiles the
ZK circuits for both the Besu PCU and the Ethereum PCU, generates the required proving and verification keys, publishes the signed verification keys on the external server, along with the public keys of the signatures in the credential servers, and requests the PCU nodes to load and verify the verification keys:

```bash
node packages/cacti-plugin-zk-provider/dist/lib/requestInterfaceV2.js
```

Wait for this process to end before starting the SATP transfer test.

## 6. Execute the SATP transfer test

Open another console window and execute the SATP integration test for sending
a token from Besu to Ethereum:

```bash
node packages/cactus-plugin-satp-hermes/node_modules/jest/bin/jest.js packages/cactus-plugin-satp-hermes/src/test/typescript/integration/gateway/satp-e2e-2-gateways-zk\.test\.ts -t '^2 SATPGateways sending a token from Besu to Ethereum(\s.*)?$'
```

## Troubleshooting

If the network already exists, Docker will report a name conflict. Check it
with:

```bash
docker network ls
```

If a service container already exists, remove it before starting a new one:

```bash
docker rm -f <container-name>
```

Replace `<container-name>` with one of `besupcu`, `ethpcu`, `extserver`,
`ethcredserver`, or `besucredserver`.

## Instability and recovery

Sometimes the PCU may fail because of a port conflict or because Docker stops
a container when available memory is low. If this happens, remove the affected
container and execute its original `docker run` command again:

```bash
docker rm -f <container-name>
```

For example, to restart the Besu PCU service:

```bash
docker rm -f besupcu
docker run -p 12802:12802 --name besupcu --network zknet zkserverv2 BESU_PCU
```

Repeat this process for any other affected service, using the matching
container name, port, and service argument from the commands above.

If any component fails while the SATP test is running, restart from Step 4.
