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

describe("ZK Server Setup and Service Requests", () => {
  const PORT = 3000;
  const redisPort = "6379";
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

  describe("ZK Server With Endpoints", async () => {
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
        body: JSON.stringify({ params: [{ circuitName: "proveSquare.zok" }] }),
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
        body: JSON.stringify({ params: [compilationArtifacts, ["2", "4"]] }),
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
        body: JSON.stringify({ params: [compilationArtifacts] }),
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
        body: JSON.stringify({
          params: [compilationArtifacts, witness, keypair],
        }),
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
        body: JSON.stringify({ params: [proof, keypair] }),
      });
      const verifyResponseData = await verifyResponse.json();
      const isValid = verifyResponseData.result;
      expect(isValid).toBe(true);
    });
  });

  describe("ZK Server Storing and Fetching from Database", async () => {
    let zkServer: ZeroKnowledgeServer;
    let redisProcess: any;
    let redisClient: RedisClientType;
    let compilationArtifacts: CompilationArtifacts;
    let keypair: SetupKeypair;
    let witnessKey: string;
    let proofKey: string;
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

    it("should generate a witness and store it in the database", async () => {
      const compilationResponse = await fetch(
        `http://localhost:${PORT}/compile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            params: [{ circuitName: "proveSquare.zok" }],
          }),
        },
      );
      const compilationResponseData = await compilationResponse.json();
      compilationArtifacts = compilationResponseData.result;
      expect(compilationArtifacts).toBeDefined();

      const witnessResponse = await fetch(`http://localhost:${PORT}/witness`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [compilationArtifacts, ["2", "4"]],
          store: 6379,
        }),
      });
      const witnessResponseData = await witnessResponse.json();
      witnessKey = witnessResponseData.result;
      expect(witnessKey).toBeDefined();
      expect(witnessKey).not.toBeNull();
      const storedWitness = await redisClient.hGet(
        `sha256: ${witnessKey}`,
        "result",
      );
      expect(storedWitness).toBeDefined();
      expect(storedWitness).not.toBeNull();
    });

    it("should generate a proof with the stored witness, and store the proof in the database", async () => {
      const keypairResponse = await fetch(`http://localhost:${PORT}/keypair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: [compilationArtifacts] }),
      });
      const keypairResponseData = await keypairResponse.json();
      keypair = keypairResponseData.result;
      expect(keypair).toBeDefined();

      const storedWitness = await redisClient.hGet(
        `sha256: ${witnessKey}`,
        "result",
      );

      const proofResponse = await fetch(`http://localhost:${PORT}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [compilationArtifacts, JSON.parse(storedWitness!), keypair],
          store: 6379,
        }),
      });
      const proofResponseData = await proofResponse.json();
      proofKey = proofResponseData.result;
      expect(proofKey).toBeDefined();
      expect(proofKey).not.toBeNull();
      const storedProof = await redisClient.hGet(
        `sha256: ${proofKey}`,
        "result",
      );
      expect(storedProof).toBeDefined();
      expect(storedProof).not.toBeNull();
    });

    it("should retrieve the stored proof and verify it", async () => {
      const storedProof = await redisClient.hGet(
        `sha256: ${proofKey}`,
        "result",
      );

      const verifyResponse = await fetch(`http://localhost:${PORT}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: [JSON.parse(storedProof!), keypair] }),
      });
      const verifyResponseData = await verifyResponse.json();
      const isValid = verifyResponseData.result;
      expect(isValid).toBe(true);
    });
  });

  describe("ZK Server automatically Fetching from Database", async () => {
    afterAll(() => {
      if (zkServer) {
        zkServer.serverStop();
      }
      if (redisProcess) {
        redisProcess.kill();
      }
    });
    let zkServer: ZeroKnowledgeServer;
    let redisProcess: any;
    let redisClient: RedisClientType;
    let compilationKey: string;
    let proofKey: string;
    let keypair: SetupKeypair;
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
    it("Compile and store circuit compilation", async () => {
      const compilationResponse = await fetch(
        `http://localhost:${PORT}/compile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            params: [{ circuitName: "proveSquare.zok" }],
            store: 6379,
          }),
        },
      );
      const compilationResponseData = await compilationResponse.json();
      compilationKey = compilationResponseData.result;
      expect(compilationKey).toBeDefined();
      expect(compilationKey).not.toBeNull();
    });
    it("should automatically retrieve compilation artifacts when needed", async () => {
      const compilationFetch = {
        fetchAt: "6379",
        key: compilationKey,
      };
      const witnessResponse = await fetch(`http://localhost:${PORT}/witness`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [compilationFetch, ["2", "4"]],
        }),
      });
      const witnessResponseData = await witnessResponse.json();
      const witness = witnessResponseData.result;
      expect(witness).toBeDefined();
      expect(witness).not.toBeNull();

      const keypairResponse = await fetch(`http://localhost:${PORT}/keypair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: [compilationFetch] }),
      });
      const keypairResponseData = await keypairResponse.json();
      keypair = keypairResponseData.result;
      expect(keypair).toBeDefined();

      const proofResponse = await fetch(`http://localhost:${PORT}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [compilationFetch, witness, keypair],
          store: 6379,
        }),
      });
      const proofResponseData = await proofResponse.json();
      proofKey = proofResponseData.result;
      expect(proofKey).toBeDefined();
      expect(proofKey).not.toBeNull();
    });
    it("should automatically retrieve proof when needed and verify it", async () => {
      const verifyResponse = await fetch(`http://localhost:${PORT}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [{ fetchAt: "6379", key: proofKey }, keypair],
        }),
      });
      const verifyResponseData = await verifyResponse.json();
      const isValid = verifyResponseData.result;
      expect(isValid).toBe(true);
    });
  });
});
