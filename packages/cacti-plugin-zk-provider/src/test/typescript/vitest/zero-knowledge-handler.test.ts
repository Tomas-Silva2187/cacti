import {
  CircuitLoadSetup,
  ZeroKnowledgeHandler,
  ZeroKnowledgeHandlerOptions,
} from "../../../main/typescript/zk-actions/zoKratesHandler";

//import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("ZeroKnowledgeHandler", () => {
  let handler: ZeroKnowledgeHandler;
  let compiledCircuit: any;
  let witness: any;
  let keypair: any;

  describe("Single handler testing", () => {
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
    let witness2: any;
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
      witness2 = await handler2.computeWitness(compiledCircuit, ["3", "9"]);
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
});
