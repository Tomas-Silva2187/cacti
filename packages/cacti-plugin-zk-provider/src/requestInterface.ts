import { ZeroKnowledgeClient } from "./main/typescript/server/zeroKnowledgeClient.js";
import * as readline from "readline";

const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function expectInput(query: string): Promise<string> {
  return new Promise((resolve) => input.question(query, resolve));
}

try {
  const client = new ZeroKnowledgeClient(3000, "localhost");
  while (true) {
    console.log("Client Services:");
    console.log("0. Select Circuit");
    console.log("1. Compile Circuit");
    console.log("2. Generate Witness");
    console.log("3. Generate Keypair");
    console.log("4. Generate Proof");
    console.log("5. Verify Proof");
    console.log("6. Exit");

    const in1 = await expectInput("Select Service: ");
    const in2 = await expectInput("Store Result on Server DB (y/n): ");
    let storeFlag;
    let circuitName;
    if (in2.toLowerCase() === "y") {
      storeFlag = true;
    } else {
      storeFlag = false;
    }
    switch (in1) {
      case "0":
        circuitName = await expectInput(
          "Enter Circuit Name (e.g., <circuit name>.zok): ",
        );
        break;
      case "1":
        if (circuitName === undefined) {
          console.log("Please select a circuit first (option 0).");
          break;
        }
        const r1 = await client.requestCompile(storeFlag, circuitName);
        if (r1 == "ACK") {
          console.log("Circuit Compiled. Return: ");
          //console.log("->" + client.getCompilation());
        }
        break;
      case "2":
        const r2 = await client.requestWitness(storeFlag, ["2", "4"]);
        if (r2 == "ACK") {
          console.log("Witness Generated. Return: ");
          console.log("->" + client.getWitness());
        }
        break;
      case "3":
        const r3 = await client.requestKeypair(storeFlag);
        if (r3 == "ACK") {
          console.log("Keypair generated. Return: ");
          console.log("->" + client.getKeypair());
        }
        break;
      case "4":
        const r4 = await client.requestProof(storeFlag);
        if (r4 == "ACK") {
          console.log("Proof generated. Return: ");
          console.log("->" + client.getProof());
        }
        break;
      case "5":
        const r5 = await client.requestProofVerification();
        console.log("Proof Verified. Return: ");
        console.log("->" + r5);
        break;
      case "6":
        console.log("Exiting...");
        input.close();
        process.exit(0);
      default:
        console.log("Invalid selection. Please try again.");
    }
  }
} catch (error) {
  throw error;
}
