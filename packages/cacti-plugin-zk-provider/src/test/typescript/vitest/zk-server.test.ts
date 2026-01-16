import path from "path";
import {
  EndpointCallType,
  EndpointSetup,
  EndpointService,
} from "../../../main/typescript/endpoints/endpoint";
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
import { spawn } from "child_process";
import { createClient, RedisClientType } from "redis";
import { DatabaseType } from "../../../main/typescript/database/zkDatabase";
import { ZeroKnowledgeClient } from "../../../main/typescript/server/zeroKnowledgeClient";
import { mkdtemp, rm } from "fs/promises";
import { readFileSync } from "fs";
import { createHash } from "crypto";

describe("ZK Server Setup and Service Requests", () => {
  const PORT = 3000;
  const redisPort = "6379";

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

  describe("ZK Server With Endpoints", async () => {
    afterAll(() => {
      if (zkServer) {
        zkServer.serverStop();
      }
    });
    let zkServer: ZeroKnowledgeServer;
    let compilationArtifacts: CompilationArtifacts;
    let witness: ComputationResult;
    let keypair: SetupKeypair;
    let proof: Proof;

    it("should successfully setup a full ZK Server", async () => {
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

describe("ZK Client-Server Interaction", async () => {
  afterAll(() => {
    if (zkServer) {
      zkServer.serverStop();
    }
    if (redisProcess) {
      redisProcess.kill();
    }
  });
  let zkServer: ZeroKnowledgeServer;
  let zkClient: ZeroKnowledgeClient;
  let redisProcess: any;
  let redisClient: RedisClientType;
  const redisPort = "6379";
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
  describe("Client to Server", async () => {
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
    it("should successfully start a client for the server", async () => {
      zkClient = new ZeroKnowledgeClient(3000, "localhost");
      expect(zkClient).toBeDefined();
    });
    it("should compile a circuit and store it", async () => {
      const compileAck = await zkClient.requestCompile(true, "proveSquare.zok");
      expect(compileAck).toBe("ACK");
    });
    it("should perform all steps and obtain a valid proof", async () => {
      const witnessAck = await zkClient.requestWitness(true, ["2", "4"]);
      expect(witnessAck).toBe("ACK");
    });
    it("should generate a keypair for proof generation and verification", async () => {
      const keypairAck = await zkClient.requestKeypair(true);
      expect(keypairAck).toBe("ACK");
    });
    it("should generate a proof", async () => {
      const proofAck = await zkClient.requestProof(true);
      expect(proofAck).toBe("ACK");
    });
    it("should verify a proof successfully", async () => {
      const verifyAck = await zkClient.requestProofVerification();
      expect(verifyAck).toBe(true);
    });
  });
  describe("ZK Server circuit load and validation", async () => {
    let tempCircuitDir: string;
    beforeAll(async () => {
      tempCircuitDir = await mkdtemp(path.join(__dirname, "/test-zk-circuits"));
    });
    afterAll(async () => {
      await rm(tempCircuitDir, { recursive: true, force: true });
    });
    it("should launch DB, Server and Client", async () => {
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

      zkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: tempCircuitDir,
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

      zkClient = new ZeroKnowledgeClient(3000, "localhost");
      expect(zkClient).toBeDefined();
    });

    it("should load a new circuit into the server Database", async () => {
      const circuitPath = path.join(__dirname, "../../zokrates");
      const circuitCode = readFileSync(
        path.join(circuitPath, "proveSquare.zok"),
        "utf-8",
      );
      const circuitHash = createHash("sha256")
        .update(circuitCode)
        .digest("hex");
      const circuitID = `proveSquare${circuitHash}`;
      const circuitValue = {
        circuitCode: circuitCode,
        circuitCredentials: circuitHash,
      };
      await redisClient.hSet(circuitID, circuitValue);
    });

    it("should successfully request a circuit load and validation", async () => {
      const circuitID = "testCircuit";
      const circuitCredentials = "validCredentials";
      const loadAck = await zkClient.requestCircuitLoad(
        circuitID,
        circuitCredentials,
      );
      expect(loadAck).toBe("ACK");
    });
  });
});
