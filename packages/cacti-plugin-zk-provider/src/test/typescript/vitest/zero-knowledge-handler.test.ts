import {
  CircuitLoadSetup,
  ZeroKnowledgeHandler,
  ZeroKnowledgeHandlerOptions,
} from "../../../main/typescript/zk-actions/zoKratesHandler";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { VerificationKey } from "zokrates-js";
import { EthereumContractDeployer } from "../ethereumChain";
import { execSync } from "child_process";
import fs from "fs";
//import { Secp256k1Keys, JsObjectSigner } from "@hyperledger/cactus-common";
/*import {
  derivePublicKey,
  signMessage,
  verifySignature,
} from "@zk-kit/eddsa-poseidon";*/

//const { derivePublicKey, signMessage, verifySignature } = eddsaPoseidon;

describe("ZeroKnowledgeHandler", () => {
  describe("Single handler testing", () => {
    let handler: ZeroKnowledgeHandler;
    let verificationKey: VerificationKey;
    it("should initialize with default options", async () => {
      handler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
    });

    it("should compile the zk circuit and generate cryptographic artifacts for it", async () => {
      verificationKey = await handler.compileCircuit({
        circuitName: "proveSquare.zok",
      } as CircuitLoadSetup);
      expect(verificationKey).toBeDefined();
      await handler.computeWitness(["2", "4"]);
    });

    it("should generate a proof and successfully verify it", async () => {
      const proof = await handler.generateProof();
      expect(proof).toBeDefined();
      const isValid = await handler.verifyProof(proof, verificationKey);
      expect(isValid).toBe(true);
    });
  });

  describe("Multiple handler testing", () => {
    let handler1: ZeroKnowledgeHandler;
    let handler2: ZeroKnowledgeHandler;
    let vk1: VerificationKey;
    let vk2: VerificationKey;
    it("should initialize two handlers with default options", async () => {
      handler1 = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      handler2 = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      await handler1.initializeZoKrates();
      await handler2.initializeZoKrates();
      vk1 = await handler1.compileCircuit({
        circuitName: "proveSquare.zok",
      } as CircuitLoadSetup);
    });

    it("Handler should generate a valid proof and artifacts for another handler", async () => {
      await handler1.computeWitness(["2", "4"]);
      const proof = await handler1.generateProof();
      const isValid = await handler2.verifyProof(proof, vk1);
      expect(isValid).toBe(true);
    });

    it("should fail when artifacts do not match with their respective proof", async () => {
      vk2 = await handler2.compileCircuit({
        circuitName: "proveSquare.zok",
      } as CircuitLoadSetup);
      expect(vk2).toBeDefined();
      await handler2.computeWitness(["2", "4"]);
      const proof = await handler2.generateProof();
      const isValid = await handler2.verifyProof(proof, vk1);
      expect(isValid).toBe(false);
    });
  });

  describe("Prove hash knowledge", () => {
    function stringToU16Array(str: string): string[] {
      const bytes = Array.from(str).map((c) => c.charCodeAt(0));
      const arr: string[] = [];
      for (let i = 0; i < bytes.length; i += 2) {
        let a;
        if (i + 1 >= bytes.length) {
          a = 0;
        } else {
          a = bytes[i + 1];
        }
        const rep = bytes[i] * 256 + a;
        arr.push(rep.toString());
      }
      return arr;
    }
    function hashToU32Array(hash: string): string[] {
      const arr: string[] = [];
      const hashArr = Array.from(hash);
      for (let i = 0; i < hashArr.length; i += 8) {
        if (i + 8 <= hashArr.length) {
          const segment = hashArr.slice(i, i + 8).join("");
          arr.push(segment);
        }
      }
      return arr;
    }
    it("should prove knowledge of pre-hash", async () => {
      const secret = "mysecret";
      const handler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
      const vk = await handler.compileCircuit({
        circuitName: "proveHash64Knowledge.zok",
      } as CircuitLoadSetup);
      expect(vk).toBeDefined();
      const localhash = createHash("sha256").update(secret).digest("hex");
      const toHash = stringToU16Array(secret);
      const hash32 = hashToU32Array(localhash);
      await handler.computeWitness(toHash.concat(hash32));
      const proof = await handler.generateProof();
      expect(proof).toBeDefined();
      const isValid = await handler.verifyProof(proof, vk);
      expect(isValid).toBe(true);
    }, 150000);
  }, 150000);
});

describe("On-chain Zero Knowledge", () => {
  const mockContractDeployer = new EthereumContractDeployer();
  let zkHandler: ZeroKnowledgeHandler;
  let trfTx: any;
  function hexToU16Array(str: string): string[] {
    const bytes = Array.from(str).map((c) => c.charCodeAt(0));
    const arr: string[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
      let a;
      if (i + 1 >= bytes.length) {
        a = 0;
      } else {
        a = bytes[i + 1];
      }
      const rep = bytes[i] * 256 + a;
      arr.push(rep.toString());
    }
    return arr;
  }
  function hexToU16Array2(hex: string): string[] {
    // Remove 0x prefix if present
    if (hex.startsWith("0x") || hex.startsWith("0X")) {
      hex = hex.slice(2);
    }
    // Pad with leading zero if odd length
    if (hex.length % 4 !== 0) {
      hex = hex.padStart(hex.length + (4 - (hex.length % 4)), "0");
    }
    const arr: string[] = [];
    for (let i = 0; i < hex.length; i += 4) {
      const chunk = hex.slice(i, i + 4);
      arr.push(parseInt(chunk, 16).toString());
    }
    return arr;
  }
  /*function hexToU32Array(hex: string): string[] {
    if (hex.startsWith("0x") || hex.startsWith("0X")) {
      hex = hex.slice(2);
    }
    const arr: string[] = [];
    for (let i = 0; i < hex.length; i += 8) {
      // Take 8 hex chars (32 bits)
      const chunk = hex.slice(i, i + 8);
      arr.push(parseInt(chunk, 16).toString());
    }
    return arr;
  }*/
  describe("Prove hash over data concatenation", () => {
    it("Should deploy ERC20 token and perform calls", async () => {
      await mockContractDeployer.deployERC20Contract();
      await mockContractDeployer.mintTokens(1000);
      trfTx = await mockContractDeployer.transferTokens(200);
    });
    it("Should start a zkHandler class", async () => {
      zkHandler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
        chainPort: "8545",
      } as ZeroKnowledgeHandlerOptions);
      expect(zkHandler).toBeDefined();
      await zkHandler.initializeZoKrates();

      const zoKratesCompatString = trfTx.from.slice(-40).padStart(48, "0");
      const txBlockStringhex = (88).toString(16).padStart(2, "0");
      const txAmountStringHex = (100).toString(16).padStart(2, "0");
      console.log(
        `addr: ${zoKratesCompatString}, bn: ${txBlockStringhex}, am: ${txAmountStringHex}`,
      );
      const completeString =
        zoKratesCompatString + txBlockStringhex + txAmountStringHex;
      console.log(completeString);
      const cryptoHash = createHash("sha256")
        .update(completeString)
        .digest("hex");
      console.log(cryptoHash);

      const vk = await zkHandler.compileCircuit({
        circuitName: "proveConcat.zok",
      } as CircuitLoadSetup);
      expect(vk).toBeDefined();
      console.log(zoKratesCompatString);
      const array1 = hexToU16Array(zoKratesCompatString);
      const array2 = hexToU16Array(txBlockStringhex);
      const array3 = hexToU16Array(txAmountStringHex);
      const a1 = hexToU16Array2(zoKratesCompatString);
      const a2 = hexToU16Array2(txBlockStringhex);
      const a3 = hexToU16Array2(txAmountStringHex);
      console.log("\n\narray1 " + a1);
      console.log("\n\narray2 " + a2);
      console.log("\n\narray3 " + a3);
      await zkHandler.computeWitness([array1, array2[0], array3[0]]);
      const proof = await zkHandler.generateProof();
      expect(proof).toBeDefined();
      console.log(JSON.stringify(proof));
    }, 1500000);
  }, 1500000);

  describe("Prove signature", () => {
    it("Should start a zkHandler class", async () => {
      /*zkHandler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
        chainPort: "8545",
      } as ZeroKnowledgeHandlerOptions);
      expect(zkHandler).toBeDefined();
      await zkHandler.initializeZoKrates();*/

      const val = "0000000070997970C51812dc3A010C7d01b50e0d17dc79C8";
      console.log(parseInt(val, 16));

      const outputDir = path.resolve(__dirname, "../../../main/python/outputs");
      console.log(outputDir);
      const out = execSync(`python3 ../main.py ${val}`, { cwd: outputDir })
        .toString()
        .trim();
      console.log(out);
      const inputsFile = path.resolve(
        __dirname,
        "../../../main/python/outputs/inputs.json",
      );
      const circuitInputsJsonStr = fs.readFileSync(inputsFile, "utf8");
      console.log(circuitInputsJsonStr);

      const circuitInputJson = JSON.parse(circuitInputsJsonStr);
      console.log(circuitInputJson);

      /*const vk = await zkHandler.compileCircuit({
        circuitName: "proveSignature.zok",
      } as CircuitLoadSetup);
      expect(vk).toBeDefined();
      await zkHandler.computeWitness([
        circuitInputJson.R,
        circuitInputJson.S,
        circuitInputJson.A,
        circuitInputJson.M0,
        circuitInputJson.M1,
      ]);*/
    }, 1500000);
  }, 1500000);
});
