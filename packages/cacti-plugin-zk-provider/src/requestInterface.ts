import { ZeroKnowledgeClient } from "./main/typescript/server/zeroKnowledgeClient.js";
import * as readline from "readline";
import { createHash } from "crypto";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync as s_read } from "fs";
import { createClient } from "redis";
import { RequestTarget } from "./main/typescript/utils.js";
 
const input = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const circuitIdMap = new Map<string, string>();

function expectInput(query: string): Promise<string> {
  return new Promise((resolve) => input.question(query, resolve));
}

async function populateDatabase() {
  const redisClient = await createClient({url: `redis://localhost:6379`});
  await redisClient.connect();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  console.log("Populating database with sample circuits...");
  console.log(__dirname);
  const circuitsPath = __dirname + "/../../src/test/zokrates/";
  const circuitCode1 = s_read(circuitsPath + "proveSquare.zok", "utf-8");
  const circuitHash1 = createHash("sha256").update(circuitCode1).digest("hex");
  const circuitId1 = `proveSquare:${circuitHash1}`;
  const circuit1Value = {
    circuitCode: circuitCode1,
    circuitCredentials: circuitHash1,
  };
  await redisClient.hSet(circuitId1, circuit1Value);
  circuitIdMap.set("proveSquare.zok", circuitId1);
}

try {
  const client = new ZeroKnowledgeClient(3000, "localhost");
  await populateDatabase();
  let circuitName;
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
    let in2;
    if (["1", "2", "3", "4"].includes(in1)) {
      in2 = await expectInput("Store Result on Server DB (y/n): ");
    }
    
    let storeFlag;
    if (in2 !== undefined && in2.toLowerCase() === "y") {
      storeFlag = true;
    } else {
      storeFlag = false;
    }
    switch (in1) {
      case "0":
        circuitName = await expectInput(
          "Enter Circuit Name (e.g., <circuit name>.zok):\nOptions\n- proveSquare.zok\n -> ",
        );
        const fetchData = {
          infrastructureElement: RequestTarget.SERVER,
          url: { ip: "offserver1", port: 3001 },
        }
        await client.requestCircuitLoad(circuitIdMap.get(circuitName)!, "HASH", fetchData);
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
