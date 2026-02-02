import {
  CircuitLoadSetup,
  ZeroKnowledgeHandler,
  ZeroKnowledgeHandlerOptions,
  ZeroKnowledgeProviderOptions,
} from "../../../main/typescript/zk-actions/zoKratesHandler";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";

describe("ZeroKnowledgeHandler", () => {
  describe("Single handler testing", () => {
    let handler: ZeroKnowledgeHandler;
    let compiledCircuit: any;
    let witness: any;
    let keypair: any;
    it("should initialize with default options", async () => {
      handler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
    });

    it("should compile the zk circuit and generate cryptographic artifacts for it", async () => {
      compiledCircuit = await handler.compileCircuit({
        circuitName: "proveSquare.zok",
      } as CircuitLoadSetup);
      expect(compiledCircuit).toBeDefined();
      witness = await handler.computeWitness(compiledCircuit, ["2", "4"]);
      expect(witness).toBeDefined();
      keypair = await handler.generateProofKeyPair(compiledCircuit);
      expect(keypair).toBeDefined();
    });

    it("should generate a proof and successfully verify it", async () => {
      const proof = await handler.generateProof(
        compiledCircuit,
        witness,
        keypair,
      );
      expect(proof).toBeDefined();
      const isValid = await handler.verifyProof(proof, keypair);
      expect(isValid).toBe(true);
    });
  });

  describe("Multiple handler testing", () => {
    let handler1: ZeroKnowledgeHandler;
    let handler2: ZeroKnowledgeHandler;
    let compiledCircuit: any;
    let witness1: any;
    let keypair1: any;
    let keypair2: any;
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
      compiledCircuit = await handler1.compileCircuit({
        circuitName: "proveSquare.zok",
      } as CircuitLoadSetup);
    });

    it("Handler should generate a valid proof and artifacts for another handler", async () => {
      witness1 = await handler1.computeWitness(compiledCircuit, ["2", "4"]);
      keypair1 = await handler1.generateProofKeyPair(compiledCircuit);
      const proof = await handler1.generateProof(
        compiledCircuit,
        witness1,
        keypair1,
      );
      const isValid = await handler2.verifyProof(proof, keypair1);
      expect(isValid).toBe(true);
    });

    it("should fail when artifacts do not match with their respective proof", async () => {
      keypair2 = await handler2.generateProofKeyPair(compiledCircuit);
      const proof = await handler1.generateProof(
        compiledCircuit,
        witness1,
        keypair1,
      );
      const isValid = await handler2.verifyProof(proof, keypair2);
      expect(isValid).toBe(false);
    });
  });

  describe("Hash function testing", () => {
    it("should hash inputs correctly", async () => {
      const handler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
        providerOptions: {
          backend: "bellman",
          curve: "bn128",
          scheme: "g16",
        } as ZeroKnowledgeProviderOptions,
      } as ZeroKnowledgeHandlerOptions);
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
      const compiledCircuit = await handler.compileCircuit({
        circuitName: "hashCompute.zok",
      } as CircuitLoadSetup);
      expect(compiledCircuit).toBeDefined();
      const witness = await handler.computeWitness(compiledCircuit, [
        "0",
        "0",
        "0",
        "1",
        "1",
        "0",
        "1",
        "0",
        "0",
        "1",
        "0",
        "0",
        "0",
        "1",
        "1",
        "0",
        "1",
        "0",
        "0",
        "1",
        "0",
        "0",
        "0",
        "1",
        "1",
        "0",
        "1",
        "0",
        "0",
        "1",
        "0",
        "0",
        "0",
        "1",
        "1",
        "0",
        "1",
        "0",
        "0",
        "1",
      ]);
      console.log("zokrates:");
      expect(witness).toBeDefined();
      console.log(witness.output);

      const bytes = Uint8Array.from([104, 101, 108, 108, 111]);

      const hash = createHash("sha256").update(bytes).digest("hex");

      console.log("typescript hash:");
      console.log(hash);
    });
  });

  describe("Import testing", () => {
    let handler: ZeroKnowledgeHandler;
    let compiledCircuit: any;
    let witness: any;
    let keypair: any;

    function stringToU8Array(str: string): number[] {
      return Array.from(str).map(c => c.charCodeAt(0));
    }

    function stringToU16Array(str: string): number[] {
      const bytes = stringToU8Array(str);
      const arr: number[] = [];
      for (let i = 0; i < bytes.length; i += 2) {
        let a;
        if (i + 1 >= bytes.length) {
          a = 0;
        }
        else {
          a = bytes[i + 1];
        }
        const rep = (bytes[i] * 256) + a;
        arr.push(rep);
      }
      return arr;
    }
    it("should initialize with default options", async () => {
      console.log("WOrking at dir:", __dirname);
      handler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
      compiledCircuit = await handler.compileCircuit({
        circuitName: "hashCompute16.zok",
      } as CircuitLoadSetup);
      expect(compiledCircuit).toBeDefined();
      console.log(`u8 array for "abcabc":`, stringToU8Array("abcabc"));
      console.log(
        `u16 array for "abcabc":`,
        stringToU16Array("abcabc"),
      );
      witness = await handler.computeWitness(compiledCircuit, ["24930", "25441", "25187"]);
      expect(witness).toBeDefined();
      console.log("Witness output:", witness.output);
      const localhash = createHash("sha256").update("abcabc").digest("hex");
      console.log("Local hash:", localhash);
      keypair = await handler.generateProofKeyPair(compiledCircuit);
      expect(keypair).toBeDefined();
      const proof = await handler.generateProof(
        compiledCircuit,
        witness,
        keypair,
      );
      expect(proof).toBeDefined();
      const isValid = await handler.verifyProof(proof, keypair);
      expect(isValid).toBe(true);
    }, 150000);
  }, 150000);
  describe("Prove hash knowledge", () => {
    let handler: ZeroKnowledgeHandler;
    let compiledCircuit: any;
    let witness: any;
    let keypair: any;

    function stringToU8Array(str: string): number[] {
      return Array.from(str).map(c => c.charCodeAt(0));
    }

    function stringToU16Array(str: string): string[] {
      const bytes = stringToU8Array(str);
      const arr: string[] = [];
      for (let i = 0; i < bytes.length; i += 2) {
        let a;
        if (i + 1 >= bytes.length) {
          a = 0;
        }
        else {
          a = bytes[i + 1];
        }
        const rep = (bytes[i] * 256) + a;
        arr.push(rep.toString());
      }
      return arr;
    }
    function hashToU32Array(hash: string): string[] {
      const arr: string[] = [];
      const hashArr = Array.from(hash);
      for (let i=0; i < hashArr.length; i += 8) {
        if (i + 8 <= hashArr.length) {
          const segment = hashArr.slice(i, i + 8).join("");
          //arr.push(BigInt("0x" + segment).toString());
          arr.push(segment);
        }
      }
      return arr;
    }
    it("should initialize with default options", async () => {
      const secret = "mysecret";
      //const secretBytes = stringToU16Array(secret);
      handler = new ZeroKnowledgeHandler({
        logLevel: "INFO",
        zkcircuitPath: path.join(__dirname, "../../zokrates"),
      } as ZeroKnowledgeHandlerOptions);
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
      compiledCircuit = await handler.compileCircuit({
        circuitName: "proveHash64Knowledge.zok",
      } as CircuitLoadSetup);
      expect(compiledCircuit).toBeDefined();
      console.log(`u8 array for ${secret}:`, stringToU8Array(secret));
      console.log(
        `u16 array for ${secret}:`,
        stringToU16Array(secret),
      );
      const localhash = createHash("sha256").update(secret).digest("hex");
      console.log("Local hash:", localhash);
      const toHash = stringToU16Array(secret);
      const hash32 = hashToU32Array(localhash);
      console.log(`hash array:`, hash32);
      witness = await handler.computeWitness(compiledCircuit, toHash.concat(hash32));
      expect(witness).toBeDefined();
      console.log("Witness output:", witness.output);
      
      keypair = await handler.generateProofKeyPair(compiledCircuit);
      expect(keypair).toBeDefined();
      const proof = await handler.generateProof(
        compiledCircuit,
        witness,
        keypair,
      );
      expect(proof).toBeDefined();
      const isValid = await handler.verifyProof(proof, keypair);
      expect(isValid).toBe(true);
    }, 150000);
  }, 150000);
});
