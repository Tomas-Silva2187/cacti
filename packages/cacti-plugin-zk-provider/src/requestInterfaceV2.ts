import { ServerClient } from "./main/typescript/server/ServerClient.js";
import { JsObjectSigner, Secp256k1Keys } from "@hyperledger/cactus-common";

try {
  const ethClient = new ServerClient(12801, "localhost");
  const besuClient = new ServerClient(12802, "localhost");

  const besu_vk = await besuClient.compileCircuit("gatewayCommitment.zok");
  const eth_vk = await ethClient.compileCircuit("gatewayCommitment.zok");
  const besuCredClient0 = new ServerClient(12805, "localhost");
  const besu_keypair = Secp256k1Keys.generateKeyPairsBuffer();
  await besuCredClient0.postCredential(
    besu_keypair.publicKey.toString(),
    "1",
    "BESU_2X",
  );
  const ethCredClient0 = new ServerClient(12804, "localhost");
  const eth_keypair = Secp256k1Keys.generateKeyPairsBuffer();
  await ethCredClient0.postCredential(
    eth_keypair.publicKey.toString(),
    "1",
    "ETHEREUM",
  );
  const extClient0 = new ServerClient(12803, "localhost");
  const signer0 = new JsObjectSigner({
    privateKey: besu_keypair.privateKey,
  });
  const signature0 = signer0.sign(JSON.stringify(besu_vk));
  await extClient0.postVerificationKey(
    JSON.stringify(besu_vk),
    "1",
    "BESU_2X",
    signature0.toString(),
  );
  const extClient02 = new ServerClient(12803, "localhost");
  const signer02 = new JsObjectSigner({
    privateKey: eth_keypair.privateKey,
  });
  const signature02 = signer02.sign(JSON.stringify(eth_vk));
  await extClient02.postVerificationKey(
    JSON.stringify(eth_vk),
    "1",
    "ETHEREUM",
    signature02.toString(),
  );
  await ethClient.loadVerificationKey("1", "BESU_2X");
  await besuClient.loadVerificationKey("1", "ETHEREUM");
} catch (error) {
  throw error;
}
