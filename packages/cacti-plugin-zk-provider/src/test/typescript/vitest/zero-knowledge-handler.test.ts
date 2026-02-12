import {
  CircuitLoadSetup,
  ZeroKnowledgeHandler,
  ZeroKnowledgeHandlerOptions,
} from "../../../main/typescript/zk-actions/zoKratesHandler";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { VerificationKey } from "zokrates-js";

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
