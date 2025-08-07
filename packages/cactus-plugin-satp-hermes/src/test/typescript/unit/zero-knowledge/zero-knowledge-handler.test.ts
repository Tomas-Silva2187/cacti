import { ZeroKnowledgeHandler } from "../../../../main/typescript/cross-chain-mechanisms/bridge/zero-knowledge/ZeroKnowledgeHandler";
//import * as fs from "fs";
import * as path from "path";

describe("ZeroKnowledgeHandler", () => {
  const zkcircuitPath = path.join(__dirname, "../../../zkcircuits");
  let handler: ZeroKnowledgeHandler;

  it("should initialize with default options", async () => {
    handler = new ZeroKnowledgeHandler({
      zkcircuitPath,
    });
    expect(handler).toBeDefined();
  });

  it("should read the zk circuit file", async () => {
    const compiledCircuit = await handler.compileCircuit("c1.zok");
    expect(compiledCircuit).toBeDefined();
    const witness = await handler.computeWitness(compiledCircuit, ["2"]);
    expect(witness).toBeDefined();
    const keypair = await handler.generateProofKeyPair(compiledCircuit);
    expect(keypair).toBeDefined();
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
