import path from "path";
import {
  EndpointCallType,
  EndpointSetup,
  Service,
} from "../../../main/typescript/endpoints/standard-endpoints";
import {
  ServerSetup,
  ZeroKnowledgeServer,
} from "../../../main/typescript/server/zeroKnowledgeServer";
import { describe, expect, it, afterAll } from "vitest";
import {
  CompilationArtifacts,
  ComputationResult,
  Proof,
  SetupKeypair,
} from "zokrates-js";

describe("ZK Server Setup and Service Requests", () => {
  const PORT = 3000;
  describe("Simplified Zero Knowledge Server Setup", async () => {
    afterAll(() => {
      zkServer.serverStop();
    });
    let zkServer: ZeroKnowledgeServer;
    class MockZeroKnowledgehandler {
      private mockProof: string;
      constructor(proofName: string) {
        this.mockProof = proofName;
      }
      getMockProof() {
        return this.mockProof;
      }
      isCorrectProof(proof: string) {
        return proof === this.mockProof;
      }
    }
    const mockZeroKnowledgeHandler = new MockZeroKnowledgehandler(
      "my-mock-proof",
    );

    it("should successfully setup a ZK Server with a GET and POST endpoints", async () => {
      const getServiceSetup = {
        serviceName: "generateProof",
        action: "getMockProof",
        callElements: {},
        endpointCallType: EndpointCallType.GET,
      } as Service;
      const postServiceSetup = {
        serviceName: "verifyProof",
        action: "isCorrectProof",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      zkServer = new ZeroKnowledgeServer(
        {
          zeroKnowledgeCircuitPath: "mock/path",
          logLevel: "INFO",
          setupServices: [
            { endpointService: getServiceSetup } as EndpointSetup,
            { endpointService: postServiceSetup } as EndpointSetup,
          ],
        } as ServerSetup,
        mockZeroKnowledgeHandler,
      );
      await zkServer.serverInit();
      expect(zkServer).toBeDefined();
    });

    it("should successfully perform a GET proof request", async () => {
      const response = await fetch(`http://localhost:${PORT}/generateProof`);
      expect((await response.json()).result).toBe("my-mock-proof");
    });

    it("should successfully perform a POST to verify a proof", async () => {
      const response = await fetch(`http://localhost:${PORT}/verifyProof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["my-mock-proof"]),
      });
      expect((await response.json()).result).toBe(true);
    });
  });

  describe("ZK Server Setup", async () => {
    afterAll(() => {
      zkServer.serverStop();
    });
    let zkServer: ZeroKnowledgeServer;
    let compilationArtifacts: CompilationArtifacts;
    let witness: ComputationResult;
    let keypair: SetupKeypair;
    let proof: Proof;

    it("should successfully setup a full ZK Server", async () => {
      const compileServiceSetup = {
        serviceName: "compile",
        action: "compileCircuit",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const computeWitnessServiceSetup = {
        serviceName: "witness",
        action: "computeWitness",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const keyPairGenServiceSetup = {
        serviceName: "keypair",
        action: "generateProofKeyPair",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const proofGenServiceSetup = {
        serviceName: "generate",
        action: "generateProof",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const proofVerServiceSetup = {
        serviceName: "verify",
        action: "verifyProof",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;

      zkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: path.join(__dirname, "../../zokrates"),
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
          { endpointService: keyPairGenServiceSetup } as EndpointSetup,
          { endpointService: proofGenServiceSetup } as EndpointSetup,
          { endpointService: proofVerServiceSetup } as EndpointSetup,
        ],
      } as ServerSetup);
      await zkServer.serverInit();
      expect(zkServer).toBeDefined();
    });

    it("should compile a circuit via the endpoint", async () => {
      const response = await fetch(`http://localhost:${PORT}/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ circuitName: "proveSquare.zok" }]),
      });
      const responseData = await response.json();
      compilationArtifacts = responseData.result;
      expect(compilationArtifacts).toBeDefined();
      expect(compilationArtifacts).toHaveProperty("program");
      expect(compilationArtifacts).toHaveProperty("abi");
    });

    it("should compute a witness via the endpoint", async () => {
      const response = await fetch(`http://localhost:${PORT}/witness`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([compilationArtifacts, ["2", "4"]]),
      });
      const responseData = await response.json();
      witness = responseData.result;
      expect(witness).toBeDefined();
      expect(witness).toHaveProperty("witness");
      expect(witness).toHaveProperty("output");
    });

    it("should generate a keypair via the endpoint", async () => {
      const response = await fetch(`http://localhost:${PORT}/keypair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([compilationArtifacts]),
      });
      const responseData = await response.json();
      keypair = responseData.result;
      expect(keypair).toBeDefined();
      expect(keypair).toHaveProperty("pk");
      expect(keypair).toHaveProperty("vk");
    });

    it("should generate a proof via the endpoint", async () => {
      const response = await fetch(`http://localhost:${PORT}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([compilationArtifacts, witness, keypair]),
      });
      const responseData = await response.json();
      proof = responseData.result;
      expect(proof).toBeDefined();
      expect(proof).toHaveProperty("proof");
      expect(proof).toHaveProperty("inputs");
    });

    it("should verify a proof via the endpoint", async () => {
      const verifyResponse = await fetch(`http://localhost:${PORT}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([proof, keypair]),
      });
      const verifyResponseData = await verifyResponse.json();
      const isValid = verifyResponseData.result;
      expect(isValid).toBe(true);
    });
  });

  describe("ZK Server With Database", async () => {
    let zkServer: ZeroKnowledgeServer;
    it("should successfully setup a full ZK Server with a Redis DB", async () => {
      const compileServiceSetup = {
        serviceName: "compile",
        action: "compileCircuit",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const computeWitnessServiceSetup = {
        serviceName: "witness",
        action: "computeWitness",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const keyPairGenServiceSetup = {
        serviceName: "keypair",
        action: "generateProofKeyPair",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const proofGenServiceSetup = {
        serviceName: "generate",
        action: "generateProof",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;
      const proofVerServiceSetup = {
        serviceName: "verify",
        action: "verifyProof",
        callElements: {},
        endpointCallType: EndpointCallType.POST,
      } as Service;

      zkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: path.join(__dirname, "../../zokrates"),
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
          { endpointService: keyPairGenServiceSetup } as EndpointSetup,
          { endpointService: proofGenServiceSetup } as EndpointSetup,
          { endpointService: proofVerServiceSetup } as EndpointSetup,
        ],
        databaseSetup: {
          type: "REDIS",
          local_launch: true,
        },
      } as ServerSetup);
      await zkServer.serverInit();
      expect(zkServer).toBeDefined();
    });
  });
});
