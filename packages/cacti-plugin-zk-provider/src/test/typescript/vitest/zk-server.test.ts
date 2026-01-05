import path from "path";
import {
  EndpointCallType,
  EndpointSetup,
  EndpointService,
  Endpoint,
} from "../../../main/typescript/endpoints/endpoint";
import {
  DatabaseType,
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
import { spawn } from "child_process";
import { createClient, RedisClientType } from "redis";
import { readFileSync } from "fs";

describe("ZK Server Setup and Service Requests", () => {
  const PORT = 3000;
  //const TIMEOUT = 15000;
  class TestingZeroKnowledgeServer extends ZeroKnowledgeServer {
    setupSingleEndpoint(endpointSetup: EndpointSetup, customclass: any) {
      const endpoint = new Endpoint(customclass);
      endpoint.setupEndpoint(endpointSetup);
      this.serverEndpoints.push(endpoint);
    }
  }
  describe("Simplified Zero Knowledge Server Setup", async () => {
    afterAll(() => {
      zkServer.serverStop();
    });
    let zkServer: TestingZeroKnowledgeServer;
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
        endpointName: "generateProof",
        executeFunction: "getMockProof",
        endpointCallType: EndpointCallType.GET,
      } as EndpointService;
      const postServiceSetup = {
        endpointName: "verifyProof",
        executeFunction: "isCorrectProof",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      zkServer = new TestingZeroKnowledgeServer(
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
      if (zkServer) {
        zkServer.serverStop();
      }
    });
    let zkServer: TestingZeroKnowledgeServer;
    let compilationArtifacts: CompilationArtifacts;
    let witness: ComputationResult;
    let keypair: SetupKeypair;
    let proof: Proof;

    it("should successfully setup a full ZK Server", async () => {
      const compileServiceSetup = {
        endpointName: "compile",
        executeFunction: "compileCircuit",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const computeWitnessServiceSetup = {
        endpointName: "witness",
        executeFunction: "computeWitness",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const keyPairGenServiceSetup = {
        endpointName: "keypair",
        executeFunction: "generateProofKeyPair",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const proofGenServiceSetup = {
        endpointName: "generate",
        executeFunction: "generateProof",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const proofVerServiceSetup = {
        endpointName: "verify",
        executeFunction: "verifyProof",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      zkServer = new TestingZeroKnowledgeServer({
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
    let redisProcess: any;
    let redisClient: RedisClientType;
    const redisPort = "6379";
    afterAll(() => {
      if (zkServer) {
        zkServer.serverStop();
      }
      if (redisProcess) {
        redisProcess.kill();
      }
    });

    it("should launch a local Redis server instance", async () => {
      try {
        redisProcess = spawn("redis-server", ["--port", redisPort], {
          stdio: "inherit",
        });
        redisProcess.on("error", (error: Error) => {
          throw error;
        });
        redisProcess.on("exit", () => {
          redisProcess = undefined;
        });
      } catch (error) {
        throw new Error(`Error with Redis server: ${error}`);
      }
      redisClient = await createClient({
        url: `redis://localhost:${redisPort}`,
      });
      await redisClient.connect();
      let retries = 10;
      for (retries; retries > 0; retries--) {
        try {
          const pong = await redisClient.ping();
          if (pong === "PONG") break;
        } catch (e) {
          continue;
        }
        console.log(`Retry ${retries} to connect to Redis...`);
      }
      expect(await redisClient.ping()).toBe("PONG");
    });

    it("should upload a circuit to the Redis DB", async () => {
      const circuitCode = readFileSync(
        path.join(__dirname, "../../zokrates/proveSquare.zok"),
        "utf-8",
      );
      expect(
        await redisClient.hSet(`circuit:proveSquare`, {
          code: circuitCode,
        }),
      ).toBeGreaterThan(0);
    });

    it("should successfully setup a full ZK Server with a Redis DB Client", async () => {
      const compileServiceSetup = {
        endpointName: "compile",
        executeFunction: "compileCircuit",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const computeWitnessServiceSetup = {
        endpointName: "witness",
        executeFunction: "computeWitness",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const keyPairGenServiceSetup = {
        endpointName: "keypair",
        executeFunction: "generateProofKeyPair",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const proofGenServiceSetup = {
        endpointName: "generate",
        executeFunction: "generateProof",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;
      const proofVerServiceSetup = {
        endpointName: "verify",
        executeFunction: "verifyProof",
        endpointCallType: EndpointCallType.POST,
      } as EndpointService;

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
          type: DatabaseType.REDIS,
        },
      } as ServerSetup);
      await zkServer.serverInit();
      expect(zkServer).toBeDefined();
    });
  });
});
