import * as readline from "readline";
import { ServerClient } from "./main/typescript/server/ServerClient.js";
import { JsObjectSigner, Secp256k1Keys } from "@hyperledger/cactus-common";
import { EthereumContractDeployer } from "./test/typescript/ethereumChain.js";
import { createHash } from "crypto";
import { EddsaSigner } from "./main/typescript/eddsaSigner.js";
const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function expectInput(query: string): Promise<string> {
  return new Promise((resolve) => input.question(query, resolve));
}

async function submitTransactionAndSignParams(
  mockContractDeployer: EthereumContractDeployer,
  pSessionId: string,
) {
  const trfTx1 = await mockContractDeployer.transferTokens(200);
  const trfTx = await mockContractDeployer.fetchTransactionReceipt(trfTx1.hash);

  const pToAddress = trfTx.to.slice(-40).toLowerCase();
  const pFromAddress = trfTx.from.slice(-40).toLowerCase();
  const pTxHash = trfTx.hash;
  const pTxStatus = trfTx.status.toString(16);
  const pTxAmount = (200).toString(16).padStart(3, "0");
  const pTxBlockNumber = trfTx.blockNumber.toString(16).padStart(3, "0");
  const paramsHash = createHash("sha256")
    .update(pSessionId + pToAddress + pFromAddress + pTxHash)
    .digest("hex");

  const circuitParamsHash = createHash("sha256")
    .update(pTxAmount + pTxBlockNumber + "1" + pTxStatus)
    .digest("hex");
  const val = paramsHash + circuitParamsHash;
  const eddsaSigner = new EddsaSigner("../../../../src/main/python/");
  const out = eddsaSigner.eddsaSign(val);
  console.log("signing ", val);
  return { signature: out, txHash: pTxHash };
}

async function issueTransactionAndProofGen(
  mockContractDeployer: EthereumContractDeployer,
  sessionId: string,
  client: ServerClient,
): Promise<string> {
  await mockContractDeployer.deployERC20Contract();
  await mockContractDeployer.mintTokens(1000);
  const proofParams = await submitTransactionAndSignParams(
    mockContractDeployer,
    sessionId,
  );
  const new_proof = await client.generateSignatureZkSnark(
    proofParams.txHash,
    sessionId,
    proofParams.signature,
    "http",
    "host.docker.internal",
    "8545",
  );
  console.log("proof for ", sessionId, " is ", new_proof);
  if (new_proof != undefined) {
    return "OK";
  }
  return "NOK";
}

try {
  const ethClient = new ServerClient(12801, "localhost");
  const besuClient = new ServerClient(12802, "localhost");
  let besu_vk;
  let eth_vk;
  let besu_keypair;
  let eth_keypair;
  let besu_proof;
  //let eth_proof;
  const mockContractDeployer = new EthereumContractDeployer();
  let ACCOUNTS = false;
  let MMRCON = false;
  while (true) {
    console.log("======Client Services:======");
    console.log("1. OWNER2->BesuPCU - Compile Circuit");
    console.log("2. OWNER1->EthPCU - Compile Circuit");
    console.log("3. OWNER2->BesuCred - Upload pub key");
    console.log("4. OWNER1->EthCred - Upload pub key");
    console.log("5. OWNER2->ExtServ - Upload besu_vk");
    console.log("6. OWNER1->ExtServ - Upload eth_vk");
    console.log("7. EthPCU->ExtServ - Load besu_vk");
    console.log("8. BesuPCU->ExtServ - Load eth_vk");
    console.log("9. BesuPCU - transact and generate proof");
    console.log("10. BesuPCU - concurrent transact and proofs");
    console.log("11. Do transactions on local ledger");
    //console.log("12. EthPCU - Verify Besu Proof");
    console.log("13. Test MMR");
    console.log("14. Exit");

    const in1 = await expectInput("Select Service: ");
    switch (in1) {
      case "0":
        const selection0 = await expectInput(
          "Enter Circuit (e.g., <circuit name>.zok): ",
        );
        besu_vk = await besuClient.compileCircuit(selection0);
        eth_vk = await ethClient.compileCircuit(selection0);
        const besuCredClient0 = new ServerClient(12805, "localhost");
        besu_keypair = Secp256k1Keys.generateKeyPairsBuffer();
        await besuCredClient0.postCredential(
          besu_keypair.publicKey.toString(),
          "1",
          "BESU_2X",
        );
        const ethCredClient0 = new ServerClient(12804, "localhost");
        eth_keypair = Secp256k1Keys.generateKeyPairsBuffer();
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
        break;
      case "1":
        const selection = await expectInput(
          "Enter Circuit (e.g., <circuit name>.zok): ",
        );
        besu_vk = await besuClient.compileCircuit(selection);
        console.log(besu_vk);
        break;
      case "2":
        const selection2 = await expectInput(
          "Enter Circuit (e.g., <circuit name>.zok): ",
        );
        eth_vk = await ethClient.compileCircuit(selection2);
        console.log(eth_vk);
        break;
      case "3":
        const besuCredClient = new ServerClient(12805, "localhost");
        besu_keypair = Secp256k1Keys.generateKeyPairsBuffer();
        await besuCredClient.postCredential(
          besu_keypair.publicKey.toString(),
          "1",
          "BESU_2X",
        );
        break;
      case "4":
        const ethCredClient = new ServerClient(12804, "localhost");
        eth_keypair = Secp256k1Keys.generateKeyPairsBuffer();
        await ethCredClient.postCredential(
          eth_keypair.publicKey.toString(),
          "1",
          "ETHEREUM",
        );
        break;
      case "5":
        const extClient1 = new ServerClient(12803, "localhost");
        const signer1 = new JsObjectSigner({
          privateKey: besu_keypair.privateKey,
        });
        const signature1 = signer1.sign(JSON.stringify(besu_vk));
        await extClient1.postVerificationKey(
          JSON.stringify(besu_vk),
          "1",
          "BESU_2X",
          signature1.toString(),
        );
        break;
      case "6":
        const extClient2 = new ServerClient(12803, "localhost");
        const signer2 = new JsObjectSigner({
          privateKey: eth_keypair.privateKey,
        });
        const signature2 = signer2.sign(JSON.stringify(eth_vk));
        await extClient2.postVerificationKey(
          JSON.stringify(eth_vk),
          "1",
          "ETHEREUM",
          signature2.toString(),
        );
        break;
      case "7":
        await ethClient.loadVerificationKey("1", "BESU_2X");
        break;
      case "8":
        await besuClient.loadVerificationKey("1", "ETHEREUM");
        break;
      case "9":
        await mockContractDeployer.deployERC20Contract();
        await mockContractDeployer.mintTokens(1000);
        const pSessionId =
          "amockamockamockamockamockamockamockamockamockamoc1:lock";
        besu_proof = await issueTransactionAndProofGen(
          mockContractDeployer,
          pSessionId,
          besuClient,
        );
        console.log(besu_proof);
        break;
      case "10":
        const threadSelection = await expectInput(
          "Enter number of concurrent threads: ",
        );
        const threadNumber = Number(threadSelection);
        const promiseArray: Promise<string>[] = [];
        const r = 0;
        while (r < 2) {
          for (let i = 0; i < threadNumber; i++) {
            const sessionId =
              "amockamockamockamockamockamockamockamockamockamoc" + i + ":lock";
            const promise = issueTransactionAndProofGen(
              new EthereumContractDeployer(),
              sessionId,
              new ServerClient(12802, "localhost"),
            );
            promiseArray.push(promise);
          }
          const values = await Promise.all(promiseArray);
          console.log(values);
        }

        break;
      /*case "11":
        const eth_v = await besuClient.verifyZkSnark(
          eth_proof,
          "ETHEREUM",
          "1",
        );
        console.log(eth_v);
        break;*/
      case "11":
        await mockContractDeployer.deployERC20Contract();
        const mintTx = await mockContractDeployer.mintTokens(1000);
        const mintReceipt = await mockContractDeployer.fetchTransactionReceipt(
          mintTx.hash,
        );
        console.log(mintReceipt);
        console.log("Topics ", mintReceipt.logs[0].topics);
        const transferTx = await mockContractDeployer.transferTokens(500);
        const transferReceipt =
          await mockContractDeployer.fetchTransactionReceipt(transferTx.hash);
        console.log(transferReceipt);
        console.log("Topics ", transferReceipt.logs[0].topics);
        const burnTx = await mockContractDeployer.burnTokens(100);
        const burnReceipt = await mockContractDeployer.fetchTransactionReceipt(
          burnTx.hash,
        );
        console.log(burnReceipt);
        console.log("Topics ", burnReceipt.logs[0].topics);
        break;
      case "12":
        const besu_v = await ethClient.verifyZkSnark(
          besu_proof,
          "BESU_2X",
          "1",
        );
        console.log(besu_v);
        break;
      case "13":
        const extClient = new ServerClient(12803, "localhost");
        const pSessionId13 =
          "amockamockamockamockamockamockamockamockamockamoc1";
        /*const besu_proof13 = await issueTransactionAndProofGen(
          mockContractDeployer,
          pSessionId13,
          besuClient,
        );*/
        const save = await extClient.postProof(
          "THISISJUSTAFAKEPROOF",
          "1",
          pSessionId13,
          "BESU_2X",
          "mint",
        );
        const rehash1 = createHash("sha256")
          .update("THISISJUSTAFAKEPROOF")
          .digest("hex");
        const rehash2 = createHash("sha256").update(rehash1).digest("hex");
        console.log(save);
        const res = JSON.parse(save);
        const res2 = JSON.parse(res.mmrData);
        if (!ACCOUNTS) {
          await mockContractDeployer.deployERC20Contract();
          ACCOUNTS = true;
        }
        if (!MMRCON) {
          await mockContractDeployer.deployMMRContract();
          MMRCON = true;
        }

        const append = await mockContractDeployer.appendElement(
          "0x" + rehash2,
          res2.rootHash,
          res2.peaks,
          res2.elementsCount.elementsCount,
        );
        console.log(append);
        break;
      case "14":
        console.log("Exiting...");
        input.close();
        process.exit(0);
      default:
        console.log("Invalid selection. Please try again.");
    }
    console.log("=====================");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
} catch (error) {
  throw error;
}
