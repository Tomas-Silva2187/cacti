import { createClient, RedisClientType } from "redis";
import {
  DatabaseType,
  ServerSetup,
  ZeroKnowledgeServer,
} from "../../../main/typescript/server/zeroKnowledgeServer";
import { spawn } from "child_process";
import {
  EndpointCallType,
  EndpointService,
  EndpointSetup,
} from "../../../main/typescript/endpoints/endpoint";
import path from "path";
import { ZeroKnowledgeClient } from "../../../main/typescript/server/zeroKnowledgeClient";
import { describe, expect, it, afterAll } from "vitest";

describe("ZK Server and Client", async () => {
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
});
