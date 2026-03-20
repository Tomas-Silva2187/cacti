import { describe, expect, it, afterAll } from "vitest";
import { spawn } from "child_process";
import { DatabaseType } from "../../../main/typescript/database/zkDatabase";
import { ServerUrl } from "../../../main/typescript/utils";
import {
  ServerType,
  ServerWithDB,
  ServerSetup as ServerSetupV2,
} from "../../../main/typescript/server/ServerWithDB";
import { ServerClient } from "../../../main/typescript/server/ServerClient";
import { Secp256k1Keys, JsObjectSigner } from "@hyperledger/cactus-common";
import { ZeroKnowledgeHandlerOptions } from "../../../main/typescript/zk-actions/zoKratesHandlerV2";

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
  const MOCKSESSION = "mockSessionId";
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
        "lock",
      );
    });
    it("The Owner should sign and publish the Verification Key", async () => {
      const vk = await Owner1.PCUClient.compileCircuit("proveSquare.zok");
      expect(vk).toBeDefined();
      console.log("vk with the owner is ", typeof vk);
      const signature = Owner1.signData(JSON.stringify(vk));
      console.log("vk string: ", JSON.stringify(vk));
      Owner1.ExternalServerConn.postVerificationKey(
        JSON.stringify(vk),
        "1",
        "ETH",
        signature.toString(),
        "lock",
      );
    });
    it("The second PCU should load and verify the Verification Key", async () => {
      Gateway2Client = new ServerClient(parseInt(PCU2Port), "localhost");
      const validity = await Gateway2Client.loadVerificationKey(
        "1",
        "ETH",
        "lock",
      );
      console.log(validity);
      expect(validity).toBe(true);
    });
    it("Should allow the generation of a zkSnark", async () => {
      Gateway1Client = new ServerClient(parseInt(PCU1Port), "localhost");
      proof = await Gateway1Client.generateZkSnark(
        ["2", "4"],
        MOCKSESSION,
        "lock",
      );
      expect(proof).toBeDefined();
      expect(JSON.parse(proof).proof).toBeDefined();
    });
    it("The second PCU should validate the proof with its stored Verification Key", async () => {
      const proofStatus = await Gateway2Client.verifyZkSnark(
        proof,
        "ETH",
        "1",
        "lock",
      );
      expect(proofStatus).toBe(true);
    });
  });
});
