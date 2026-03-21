import * as readline from "readline";
import { ServerClient } from "./main/typescript/server/ServerClient.js";
import { JsObjectSigner, Secp256k1Keys } from "@hyperledger/cactus-common";

const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function expectInput(query: string): Promise<string> {
  return new Promise((resolve) => input.question(query, resolve));
}

try {
  const pcuClient = new ServerClient(12801, "localhost");
  const pcu2Client = new ServerClient(12802, "localhost");
  let vk;
  let keypair;
  let proof;
  while (true) {
    console.log("======Client Services:======");
    console.log("1. OWNER->BesuPCU - Compile Circuit");
    console.log("2. OWNER->EthCred - Upload pub key");
    console.log("3. OWNER->ExtServ - Upload vk");
    console.log("4. EthPCU->ExtServ - Load vk");
    console.log("5. BesuPCU - Generate Proof");
    console.log("6. EthPCU - Verify Proof");
    console.log("7. Exit");

    const in1 = await expectInput("Select Service: ");
    switch (in1) {
      case "1":
        const selection = await expectInput(
          "Enter Circuit (e.g., <circuit name>.zok): ",
        );
        vk = await pcu2Client.compileCircuit(selection);
        console.log(vk);
        break;
      case "2":
        const ethCredClient = new ServerClient(12804, "localhost");
        keypair = Secp256k1Keys.generateKeyPairsBuffer();
        await ethCredClient.postCredential(
          keypair.publicKey.toString(),
          "1",
          "ETH",
        );
        break;
      case "3":
        const extClient = new ServerClient(12803, "localhost");
        const signer = new JsObjectSigner({
          privateKey: keypair.privateKey,
        });
        const signature = signer.sign(JSON.stringify(vk));
        await extClient.postVerificationKey(
          JSON.stringify(vk),
          "1",
          "ETH",
          signature.toString(),
        );
        break;
      case "4":
        await pcuClient.loadVerificationKey("1", "ETH");
        break;
      case "5":
        proof = await pcu2Client.generateZkSnark(["2", "4"], "MOCKSESSION");
        break;
      case "6":
        const v = await pcuClient.verifyZkSnark(proof, "ETH", "1");
        console.log(v);
        break;
      case "7":
        console.log("Exiting...");
        input.close();
        process.exit(0);
      default:
        console.log("Invalid selection. Please try again.");
    }
    console.log("=====================");
  }
} catch (error) {
  throw error;
}
