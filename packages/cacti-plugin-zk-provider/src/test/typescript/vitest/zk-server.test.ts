import path from "path";
import {
  EndpointCallType,
  EndpointSetup,
  EndpointService,
} from "../../../main/typescript/endpoints/endpoint";
import {
  ServerSetup,
  VerificationMethod,
  ZeroKnowledgeServer,
} from "../../../main/typescript/server/zeroKnowledgeServer";
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Proof, VerificationKey } from "zokrates-js";
import { spawn } from "child_process";
import { createClient, RedisClientType } from "redis";
import { DatabaseType } from "../../../main/typescript/database/zkDatabase";
import { ZeroKnowledgeClient } from "../../../main/typescript/server/zeroKnowledgeClient";
import { mkdir, rm } from "fs/promises";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import {
  FetchData,
  RequestTarget,
  ServerUrl,
} from "../../../main/typescript/utils";

import { EthereumContractDeployer } from "../ethereumChain";
import {
  ServerType,
  ServerWithDB,
  ServerSetup as ServerSetupV2,
} from "../../../main/typescript/server/ServerWithDB";
import { ServerClient } from "../../../main/typescript/server/ServerClient";
import { Secp256k1Keys, JsObjectSigner } from "@hyperledger/cactus-common";
import { ZeroKnowledgeHandlerOptions } from "../../../main/typescript/zk-actions/zoKratesHandlerV2";

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

describe("ZK Server Setup and Service Requests", () => {
  const PORT = 3000;
  const redisPort = "6379";

  describe("Endpoint Testing", async () => {
    afterAll(() => {
      if (zkServer) {
        zkServer.serverStop();
      }
    });
    let zkServer: ZeroKnowledgeServer;
    let verificationKey: VerificationKey;
    let proof: Proof;

    it("should successfully setup a full ZK Server", async () => {
      zkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: path.join(__dirname, "../../zokrates"),
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
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
      verificationKey = responseData.result;
      expect(verificationKey).toBeDefined();
    });

    it("should compute a witness via the endpoint", async () => {
      const response = await fetch(`http://localhost:${PORT}/witness`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: [["2", "4"]] }),
      });
      const responseData = await response.json();
      const witnessRequest = responseData.result;
      expect(witnessRequest).toBe("OK");
    });

    it("should generate a proof via the endpoint", async () => {
      const response = await fetch(`http://localhost:${PORT}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [],
        }),
      });
      const responseData = await response.json();
      proof = responseData.result;
      expect(proof).toBeDefined();
    });

    it("should verify a proof via the endpoint", async () => {
      const verifyResponse = await fetch(`http://localhost:${PORT}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: [proof, verificationKey] }),
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
    let vkKey: string;
    let proofKey: string;
    it("Should launch a local Redis server instance", async () => {
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
    it("Should successfully setup a full ZK Server with a Redis DB Client", async () => {
      zkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: path.join(__dirname, "../../zokrates"),
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
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
    it("Should compile the circuit and store the verification key", async () => {
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
      vkKey = compilationResponseData.result;
      expect(vkKey).toBeDefined();
      expect(vkKey).not.toBeNull();
    });
    it("should automatically retrive verification key and proof", async () => {
      const witnessResponse = await fetch(`http://localhost:${PORT}/witness`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [["2", "4"]],
        }),
      });
      const witnessResponseData = await witnessResponse.json();
      const witness = witnessResponseData.result;
      expect(witness).toBe("OK");

      const proofResponse = await fetch(`http://localhost:${PORT}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [],
          store: 6379,
        }),
      });
      const proofResponseData = await proofResponse.json();
      proofKey = proofResponseData.result;
      expect(proofKey).toBeDefined();
      expect(proofKey).not.toBeNull();

      const keyFetch = {
        fetchAt: "6379",
        key: vkKey,
      };
      const proofFetch = {
        fetchAt: "6379",
        key: proofKey,
      };
      const verifyResponse = await fetch(`http://localhost:${PORT}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: [proofFetch, keyFetch],
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
      expect(await redisClient.ping()).toBe("PONG");
    }, 20000);
    it("should successfully setup a full ZK Server with a Redis DB Client", async () => {
      zkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: path.join(__dirname, "../../zokrates"),
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
          { endpointService: proofGenServiceSetup } as EndpointSetup,
          { endpointService: proofVerServiceSetup } as EndpointSetup,
        ],
        databaseSetup: {
          type: DatabaseType.REDIS,
        },
      } as ServerSetup);
      await zkServer.serverInit();
      expect(zkServer).toBeDefined();
    }, 20000);
    it("should successfully start a client for the server", async () => {
      zkClient = new ZeroKnowledgeClient(3000, "localhost");
      expect(zkClient).toBeDefined();
    }, 20000);
    it("should compile a circuit", async () => {
      const compileAck = await zkClient.requestCompile(true, "proveSquare.zok");
      expect(compileAck).toBe("ACK");
    }, 20000);
    it("should generate a witness", async () => {
      const witnessAck = await zkClient.requestWitness(["2", "4"]);
      expect(witnessAck).toBe("ACK");
    }, 20000);
    it("should generate a proof", async () => {
      const proofAck = await zkClient.requestProof(true);
      expect(proofAck).toBe("ACK");
    }, 20000);
    it("should verify a proof successfully", async () => {
      const verifyAck = await zkClient.requestProofVerification();
      expect(verifyAck).toBe(true);
    }, 20000);
  });
  describe("Client and 2 Server interaction", async () => {
    let localZkServer: ZeroKnowledgeServer;
    let offLoadZkServer: ZeroKnowledgeServer;
    let redisProcess1: any;
    let redisProcess2: any;
    let redisClient1: RedisClientType;
    let redisClient2: RedisClientType;
    const redisPort1 = "6379";
    const redisPort2 = "6380";
    let tempCircuitDir: string;
    let circuitID: string;
    let circuitHash: string;
    let zkClient: ZeroKnowledgeClient;
    beforeAll(async () => {
      tempCircuitDir = path.join(__dirname, "/test-zk-circuits");
      await mkdir(path.join(__dirname, "/test-zk-circuits"));
    });
    afterAll(async () => {
      await rm(tempCircuitDir, { recursive: true, force: true });
      if (localZkServer) {
        localZkServer.serverStop();
      }
      if (redisProcess1) {
        redisProcess1.kill();
      }
      if (offLoadZkServer) {
        offLoadZkServer.serverStop();
      }
      if (redisProcess2) {
        redisProcess2.kill();
      }
    });
    const redirectionUrl = { ip: "localhost", port: 3001 } as ServerUrl;

    it("should launch 2 local Redis server instances", async () => {
      try {
        redisProcess1 = spawn("redis-server", ["--port", redisPort1], {
          stdio: "inherit",
        });
        redisProcess1.on("error", (error: Error) => {
          throw error;
        });
        redisProcess1.on("exit", () => {
          redisProcess1 = undefined;
        });
        redisProcess2 = spawn("redis-server", ["--port", redisPort2], {
          stdio: "inherit",
        });
        redisProcess2.on("error", (error: Error) => {
          throw error;
        });
        redisProcess2.on("exit", () => {
          redisProcess2 = undefined;
        });
      } catch (error) {
        throw new Error(`Error with Redis server: ${error}`);
      }
      redisClient1 = await createClient({
        url: `redis://localhost:${redisPort1}`,
      });
      redisClient2 = await createClient({
        url: `redis://localhost:${redisPort2}`,
      });
      await redisClient1.connect();
      await redisClient2.connect();
      expect(await redisClient1.ping()).toBe("PONG");
      expect(await redisClient2.ping()).toBe("PONG");
    }, 20000);
    it("should successfully setup 2 full ZK Servers with a Redis DB each and a Client", async () => {
      localZkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: tempCircuitDir,
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
          { endpointService: proofGenServiceSetup } as EndpointSetup,
          {
            endpointService: proofVerServiceSetup,
            redirectURL: redirectionUrl,
          } as EndpointSetup,
        ],
        serverPort: 3000,
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisPort1),
          ipAddress: "localhost",
        },
        serverId: "LOCAL",
      } as ServerSetup);
      offLoadZkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: tempCircuitDir,
        logLevel: "INFO",
        setupServices: [
          { endpointService: proofVerServiceSetup } as EndpointSetup,
        ],
        serverPort: 3001,
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisPort2),
          ipAddress: "localhost",
        },
        serverId: "OFFLOAD",
      } as ServerSetup);
      await localZkServer.serverInit();
      expect(localZkServer).toBeDefined();
      await offLoadZkServer.serverInit();
      expect(offLoadZkServer).toBeDefined();
      zkClient = new ZeroKnowledgeClient(3000, "localhost");
      expect(zkClient).toBeDefined();
    }, 20000);
    it("should load a new circuit into the Database for Server 2", async () => {
      const circuitPath = path.join(__dirname, "../../zokrates");
      const circuitCode = readFileSync(
        path.join(circuitPath, "proveSquare.zok"),
        "utf-8",
      );
      circuitHash = createHash("sha256").update(circuitCode).digest("hex");
      circuitID = `proveSquare:${circuitHash}`;
      const circuitValue = {
        circuitCode: circuitCode,
        circuitCredentials: circuitHash,
      };
      await redisClient2.hSet(circuitID, circuitValue);
    }, 20000);
    it("should proceed with the steps for a valid proof", async () => {
      const fetchData = {
        infrastructureElement: RequestTarget.SERVER,
        url: { ip: "localhost", port: 3001 } as ServerUrl,
      } as FetchData;
      expect(
        await zkClient.requestCircuitLoad(
          circuitID,
          VerificationMethod.HASH,
          fetchData,
        ),
      ).toBe("ACK");
      expect(await zkClient.requestCompile(true, "proveSquare.zok")).toBe(
        "ACK",
      );
      expect(await zkClient.requestWitness(["2", "4"])).toBe("ACK");
      expect(await zkClient.requestProof(true)).toBe("ACK");
      expect(await zkClient.requestProofVerification()).toBe(true);
    }, 20000);
  });
});

describe("Proving EVM transactions", async () => {
  describe("Proving transaction to pre-established address", async () => {
    const user1Address = "0xBcd4042DE499D14e55001CcbB24a551F3b954096"; //EthAccount10
    let ethProvider: any;
    let localZkServer: ZeroKnowledgeServer;
    let offLoadZkServer: ZeroKnowledgeServer;
    let redisProcess1: any;
    let redisProcess2: any;
    let redisClient1: RedisClientType;
    let redisClient2: RedisClientType;
    const redisPort1 = "6379";
    const redisPort2 = "6380";
    let tempCircuitDir: string;
    let circuitID: string;
    let circuitHash: string;
    let zkClient: ZeroKnowledgeClient;
    let mintReceipt: any;
    let transferReceipt: any;
    beforeAll(async () => {
      tempCircuitDir = path.join(__dirname, "../../zokrates");
    });
    afterAll(async () => {
      if (localZkServer) {
        localZkServer.serverStop();
      }
      if (redisProcess1) {
        redisProcess1.kill();
      }
      if (offLoadZkServer) {
        offLoadZkServer.serverStop();
      }
      if (redisProcess2) {
        redisProcess2.kill();
      }
    });

    const redirectionUrl = { ip: "localhost", port: 3001 } as ServerUrl;
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
    function stringToU32Array(hex: string): string[] {
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
    }
    it("should launch a 2 local Redis server instances", async () => {
      try {
        redisProcess1 = spawn("redis-server", ["--port", redisPort1], {
          stdio: "inherit",
        });
        redisProcess1.on("error", (error: Error) => {
          throw error;
        });
        redisProcess1.on("exit", () => {
          redisProcess1 = undefined;
        });
        redisProcess2 = spawn("redis-server", ["--port", redisPort2], {
          stdio: "inherit",
        });
        redisProcess2.on("error", (error: Error) => {
          throw error;
        });
        redisProcess2.on("exit", () => {
          redisProcess2 = undefined;
        });
      } catch (error) {
        throw new Error(`Error with Redis server: ${error}`);
      }
      redisClient1 = await createClient({
        url: `redis://localhost:${redisPort1}`,
      });
      redisClient2 = await createClient({
        url: `redis://localhost:${redisPort2}`,
      });
      await redisClient1.connect();
      await redisClient2.connect();
      expect(await redisClient1.ping()).toBe("PONG");
      expect(await redisClient2.ping()).toBe("PONG");
    }, 20000);
    it("should successfully setup 2 full ZK Servers with a Redis DB each and a Client", async () => {
      localZkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: tempCircuitDir,
        logLevel: "INFO",
        setupServices: [
          { endpointService: compileServiceSetup } as EndpointSetup,
          { endpointService: computeWitnessServiceSetup } as EndpointSetup,
          { endpointService: proofGenServiceSetup } as EndpointSetup,
          {
            endpointService: proofVerServiceSetup,
            redirectUrl: redirectionUrl,
          } as EndpointSetup,
        ],
        serverPort: 3000,
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisPort1),
          ipAddress: "localhost",
        },
        serverId: "LOCAL",
      } as ServerSetup);
      offLoadZkServer = new ZeroKnowledgeServer({
        zeroKnowledgeCircuitPath: tempCircuitDir,
        logLevel: "INFO",
        setupServices: [
          { endpointService: proofVerServiceSetup } as EndpointSetup,
        ],
        serverPort: 3001,
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisPort2),
          ipAddress: "localhost",
        },
        serverId: "OFFLOAD",
      } as ServerSetup);
      await localZkServer.serverInit();
      expect(localZkServer).toBeDefined();
      await offLoadZkServer.serverInit();
      expect(offLoadZkServer).toBeDefined();
      zkClient = new ZeroKnowledgeClient(3000, "localhost");
      expect(zkClient).toBeDefined();
    }, 20000);
    it("should deploy a simple ERC20 token contract on an Ethereum based chain", async () => {
      ethProvider = new EthereumContractDeployer();
      await ethProvider.deployERC20Contract();
    });
    it("should mint and transfer tokens, and store the respective receipts", async () => {
      const mintTx = await ethProvider.mintTokens();
      mintReceipt = await ethProvider.fetchTransactionReceipt(mintTx.hash);
      const transferTx = await ethProvider.transferTokens(100, user1Address);
      transferReceipt = await ethProvider.fetchTransactionReceipt(
        transferTx.hash,
      );
    });
    it("should load a new circuit into the Database for Server 2", async () => {
      const circuitPath = path.join(__dirname, "../../zokrates");
      const circuitCode = readFileSync(
        path.join(circuitPath, "proveReceipt.zok"),
        "utf-8",
      );
      circuitHash = createHash("sha256").update(circuitCode).digest("hex");
      circuitID = `proveReceiptCopy:${circuitHash}`;
      const circuitValue = {
        circuitCode: circuitCode,
        circuitCredentials: circuitHash,
      };
      await redisClient2.hSet(circuitID, circuitValue);
    }, 20000);
    it("should proceed with the steps for a valid proof", async () => {
      const mintData = [
        Number(mintReceipt.logs[0].data), //amount
        mintReceipt.logs[0].topics[2], //receiver address
      ];
      const transferData = [
        Number(transferReceipt.logs[0].data), //amount
        transferReceipt.logs[0].topics[2], //receiver address
      ];
      console.log("Address prior to u16 " + transferData[1].slice(-48));
      const txAddr = transferData[1].slice(-48);
      const txAddr2 = stringToU16Array(txAddr);
      console.log(createHash("sha256").update(txAddr).digest("hex"));
      console.log(
        stringToU32Array(
          "0x7c46fabc08c1bfc255d66771b8d1179bb9ccf58eed86639df655b522a60769f6",
        ),
      );
      const fetchData = {
        infrastructureElement: RequestTarget.SERVER,
        url: { ip: "localhost", port: 3001 } as ServerUrl,
      } as FetchData;
      expect(
        await zkClient.requestCircuitLoad(
          circuitID,
          VerificationMethod.HASH,
          fetchData,
        ),
      ).toBe("ACK");
      expect(
        await zkClient.requestCompile(true, "proveReceiptCopy.zok"),
      ).toBeDefined();
      expect(
        await zkClient.requestWitness([
          mintData[0].toString(),
          transferData[0].toString(),
          txAddr2,
        ]),
      ).toBeDefined();
      expect(await zkClient.requestProof(false)).toBeDefined();
      expect(await zkClient.requestProofVerification()).toBe(true);
    }, 90000);
  });
});

describe("Full System Setup", async () => {
  class ChainOwner {
    public CredentialServerConn: ServerClient;
    public ExternalServerConn: ServerClient;
    public PCUClient: ServerClient;
    public pubKey: Uint8Array;
    private privKey;
    private signer: JsObjectSigner;

    constructor(port1: string, port2: string, port3: string) {
      this.CredentialServerConn = new ServerClient(
        parseInt(port1),
        "localhost",
      );
      this.ExternalServerConn = new ServerClient(parseInt(port2), "localhost");
      this.PCUClient = new ServerClient(parseInt(port3), "localhost");
      const keypair = Secp256k1Keys.generateKeyPairsBuffer();
      this.pubKey = keypair.publicKey;
      this.privKey = keypair.privateKey;
      this.signer = new JsObjectSigner({
        privateKey: this.privKey,
      });
    }

    signData(data: string) {
      const dataHash = this.signer.dataHash(data);
      const signature = this.signer.sign(dataHash);
      return signature;
    }
  }
  describe("Complete framework setup for simple circuit", async () => {
    afterAll(() => {
      if (redisProcess1) {
        redisProcess1.kill();
      }
      if (redisProcess2) {
        redisProcess2.kill();
      }
      if (redisProcess3) {
        redisProcess3.kill();
      }
      if (redisProcess4) {
        redisProcess4.kill();
      }
    });
    let PCU1: ServerWithDB;
    let PCU2: ServerWithDB;
    let ExternalServer: ServerWithDB;
    let Owner1CredentialServer: ServerWithDB;
    const redisExternalServerPort = "6380";
    const redisCredentials1Port = "6381";
    const redisPCU1Port = "6382";
    const redisPCU2Port = "6383";
    let Gateway1Client: ServerClient;
    let Gateway2Client: ServerClient;
    const PCU1Port = "12801";
    const PCU2Port = "12802";
    const ExternalServerPort = "12803";
    const Owner1CredentialServerPort = "12804";
    const Owner1 = new ChainOwner(
      Owner1CredentialServerPort,
      ExternalServerPort,
      PCU1Port,
    );
    let redisProcess1;
    let redisProcess2;
    let redisProcess3;
    let redisProcess4;

    let proof: string;
    it("Should setup all components", async () => {
      try {
        redisProcess1 = spawn(
          "redis-server",
          ["--port", redisExternalServerPort],
          {
            stdio: "inherit",
          },
        );
        redisProcess1.on("error", (error: Error) => {
          throw error;
        });
        redisProcess1.on("exit", () => {
          redisProcess1 = undefined;
        });
        redisProcess2 = spawn(
          "redis-server",
          ["--port", redisCredentials1Port],
          {
            stdio: "inherit",
          },
        );
        redisProcess2.on("error", (error: Error) => {
          throw error;
        });
        redisProcess2.on("exit", () => {
          redisProcess2 = undefined;
        });
        redisProcess3 = spawn("redis-server", ["--port", redisPCU1Port], {
          stdio: "inherit",
        });
        redisProcess3.on("error", (error: Error) => {
          throw error;
        });
        redisProcess3.on("exit", () => {
          redisProcess3 = undefined;
        });
        redisProcess4 = spawn("redis-server", ["--port", redisPCU2Port], {
          stdio: "inherit",
        });
        redisProcess4.on("error", (error: Error) => {
          throw error;
        });
        redisProcess4.on("exit", () => {
          redisProcess4 = undefined;
        });
      } catch (error) {
        throw new Error(`Error with Redis server: ${error}`);
      }
      ExternalServer = new ServerWithDB({
        logLevel: "INFO",
        serverType: ServerType.EXTERNAL,
        serverPort: parseInt(ExternalServerPort),
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisExternalServerPort),
          ipAddress: "localhost",
          name: "ExternalServerDB",
        },
        serverId: "ExternalServer",
      });
      await ExternalServer.serverInit();
      Owner1CredentialServer = new ServerWithDB({
        logLevel: "INFO",
        serverType: ServerType.OWNER,
        serverPort: Number(Owner1CredentialServerPort),
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisCredentials1Port),
          ipAddress: "localhost",
          name: "CredentialsDB",
        },
        serverId: "CredentialsServer1",
      } as ServerSetupV2);
      await Owner1CredentialServer.serverInit();
      PCU1 = new ServerWithDB({
        logLevel: "INFO",
        serverType: ServerType.PCU,
        serverPort: Number(PCU1Port),
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisPCU1Port),
          ipAddress: "localhost",
          name: "PCU1DB",
        },
        serverId: "PCU1",
        zkHandlerOptions: {
          logLevel: "INFO",
          zkcircuitPath: "src/test/zokrates",
        } as ZeroKnowledgeHandlerOptions,
        counterServers: [
          {
            serverUrl: {
              ip: "localhost",
              port: parseInt(ExternalServerPort),
            } as ServerUrl,
            serverType: ServerType.EXTERNAL,
          },
        ],
      } as ServerSetupV2);
      await PCU1.serverInit();
      PCU2 = new ServerWithDB({
        logLevel: "INFO",
        serverType: ServerType.PCU,
        serverPort: Number(PCU2Port),
        databaseSetup: {
          type: DatabaseType.REDIS,
          port: parseInt(redisPCU2Port),
          ipAddress: "localhost",
          name: "PCU2DB",
        },
        serverId: "PCU2",
        zkHandlerOptions: {
          logLevel: "INFO",
          zkcircuitPath: "src/test/zokrates",
        },
        counterServers: [
          {
            serverUrl: {
              ip: "localhost",
              port: parseInt(ExternalServerPort),
            } as ServerUrl,
            serverType: ServerType.EXTERNAL,
          },
          {
            serverUrl: {
              ip: "localhost",
              port: parseInt(Owner1CredentialServerPort),
              ownerChainId: "ETH",
            } as ServerUrl,
            serverType: ServerType.OWNER,
          },
        ],
      });
      await PCU2.serverInit();
    });
    it("The Owner should publish its public key on the respective DB", async () => {
      await Owner1.CredentialServerConn.postCredential(
        Owner1.pubKey.toString(),
        "1",
        "ETH",
      );
      console.log(Owner1.pubKey + "\n\n\n");
    });
    it("The Owner should sign and publish the Verification Key", async () => {
      const vk = await Owner1.PCUClient.compileCircuit("proveSquare.zok");
      expect(vk).toBeDefined();
      const signature = Owner1.signData(JSON.stringify(vk));
      Owner1.ExternalServerConn.postVerificationKey(
        JSON.stringify(vk!),
        "1",
        "ETH",
        signature.toString(),
      );
    });
    it("The second PCU should load and verify the Verification Key", async () => {
      Gateway2Client = new ServerClient(parseInt(PCU2Port), "localhost");
      const validity = await Gateway2Client.loadVerificationKey("1", "ETH");
      expect(validity).toBe(true);
    });
    it("Should allow the generation of a zkSnark", async () => {
      Gateway1Client = new ServerClient(parseInt(PCU1Port), "localhost");
      proof = await Gateway1Client.generateZkSnark(["2", "4"]);
      expect(proof).toBeDefined();
      expect(JSON.parse(proof).proof).toBeDefined();
    });
    it("The second PCU should validate the proof with its stored Verification Key", async () => {
      const proofStatus = await Gateway2Client.verifyZkSnark(proof, "ETH", "1");
      expect(proofStatus).toBe(true);
    });
  });
});
