import {
  JsObjectSigner,
  Logger,
  LoggerProvider,
  LogLevelDesc,
  Secp256k1Keys,
} from "@hyperledger/cactus-common";
import express from "express";
import { RedisDBClient } from "../database/redisDBClient.js";
import {
  DatabaseSetup,
  DatabaseType,
  REDISKeyComponents,
  REDISNewElementLabel,
  ZKDatabaseClient,
} from "../database/zkDatabase.js";
import { DuplicateDatabaseClientError } from "./serverErrors.js";
import { Endpoints, ServerUrl } from "../utils.js";
import {
  ZeroKnowledgeHandlerV2,
  ZeroKnowledgeHandlerOptions,
} from "../zk-actions/zoKratesHandlerV2.js";
import { ServerClient } from "./ServerClient.js";

//import { createHash } from "crypto";

export enum VerificationMethod {
  HASH = "HASH",
  SIGNATURE = "SIGNATURE",
  CERTIFICATE = "CERTIFICATE",
}

export enum ServerType {
  EXTERNAL = "EXT",
  OWNER = "OWN",
  PCU = "PCU",
}

export interface ServerSetup {
  logLevel: LogLevelDesc;
  serverType: ServerType;
  serverPort?: number;
  databaseSetup?: DatabaseSetup;
  serverId?: string;
  zkHandlerOptions?: ZeroKnowledgeHandlerOptions;
  counterServers?: { serverUrl: ServerUrl; serverType: ServerType }[];
}

export class ServerWithDB {
  private readonly CLASS_TAG: string;
  private CIRCUIT_VERSION = 0;
  private log: Logger;
  private runningPort: number;
  private app = express();
  private serverInstance: any;
  private dedicatedDatabases = new Map<number, ZKDatabaseClient>();
  private mainDBPort: number | undefined;
  private dbSetup: DatabaseSetup | undefined;
  private serverId: string;
  private serverType: ServerType;
  private zkHandlerOptions: ZeroKnowledgeHandlerOptions | undefined;
  private zkHandler: ZeroKnowledgeHandlerV2 | undefined;
  private webServerClients = new Map<string, ServerClient>();
  private PCU_counter = 0;
  private EXTERNAL_counter = 0;
  private OWNER_counter = 0;
  private keypair: any;
  private objectSigner: JsObjectSigner;

  constructor(setupOptions: ServerSetup) {
    try {
      this.serverId = setupOptions.serverId ?? "default-zk-server";
      this.CLASS_TAG = `#Server[${this.serverId}]`;
      this.log = LoggerProvider.getOrCreate({
        label: "Server",
        level: setupOptions.logLevel,
      });
      this.runningPort = setupOptions.serverPort ?? 3000;
      this.dbSetup = setupOptions.databaseSetup;
      this.serverType = setupOptions.serverType;
      this.zkHandlerOptions = setupOptions.zkHandlerOptions;
      this.keypair = Secp256k1Keys.generateKeyPairsBuffer();
      this.objectSigner = new JsObjectSigner({
        privateKey: this.keypair.privateKey,
      });
      if (setupOptions.counterServers) {
        setupOptions.counterServers.forEach(
          (serverConn: { serverUrl: ServerUrl; serverType: ServerType }) => {
            switch (serverConn.serverType) {
              case ServerType.EXTERNAL:
                const id = "EXTERNAL" + this.EXTERNAL_counter;
                const client = new ServerClient(
                  serverConn.serverUrl.port,
                  serverConn.serverUrl.ip,
                );
                this.webServerClients.set(id, client);
                this.EXTERNAL_counter += 1;
                break;
              case ServerType.OWNER:
                if (!serverConn.serverUrl.ownerChainId) {
                  throw new Error(
                    `Missing the chainId when describing connection to credential server ${serverConn.serverUrl.ip}:${serverConn.serverUrl.port}`,
                  );
                }
                const id2 =
                  serverConn.serverUrl.ownerChainId +
                  "OWNER" +
                  this.OWNER_counter;
                const client2 = new ServerClient(
                  serverConn.serverUrl.port,
                  serverConn.serverUrl.ip,
                );
                this.webServerClients.set(id2, client2);
                this.OWNER_counter += 1;
                break;
              case ServerType.PCU:
                const id3 = "PCU" + this.PCU_counter;
                const client3 = new ServerClient(
                  serverConn.serverUrl.port,
                  serverConn.serverUrl.ip,
                );
                this.webServerClients.set(id3, client3);
                this.PCU_counter += 1;
                break;
            }
          },
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /**  */
  public exposeEndpoints() {
    switch (this.serverType) {
      case ServerType.EXTERNAL:
        this.app.post(Endpoints.POST_PROOF, async (req, res) => {
          try {
            if (
              req.body.proof &&
              req.body.v &&
              req.body.sessionId &&
              req.body.chainId &&
              req.body.chainAction
            ) {
              const dbClient = await this.dedicatedDatabases?.get(
                this.mainDBPort!,
              );
              const newDBKey = await dbClient?.storeElement(
                req.body.proof,
                {
                  chainId: req.body.chainId,
                  circuitVersion: req.body.v,
                  sessionId: req.body.sessionId,
                  chainAction: req.body.chainAct,
                } as REDISKeyComponents,
                REDISNewElementLabel.ZKSNARK,
              );
              //SHOULD COMPUTE NEW MMR ROOT AND RETURN ROOT AND CONSISTENCY PROOF
              res.json({ result: newDBKey });
            }
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        this.app.post(Endpoints.POST_VK, async (req, res) => {
          try {
            if (
              req.body.vk &&
              req.body.v &&
              req.body.chainId &&
              req.body.cred
            ) {
              const dbClient = await this.dedicatedDatabases?.get(
                this.mainDBPort!,
              );
              const newDBKey = await dbClient?.storeElement(
                req.body.vk,
                {
                  chainId: req.body.chainId,
                  circuitVersion: req.body.v,
                  chainAction: req.body.chainAction ?? undefined,
                } as REDISKeyComponents,
                REDISNewElementLabel.VerificationKey,
                req.body.cred,
              );
              this.log.info(
                `${this.CLASS_TAG}:${Endpoints.POST_VK} stored new zkSNARK vk with key ${newDBKey}`,
              );
              res.json({ result: newDBKey });
            }
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        this.app.post(Endpoints.GET_VK, async (req, res) => {
          try {
            if (req.body.v && req.body.chainId) {
              const dbClient = await this.dedicatedDatabases?.get(
                this.mainDBPort!,
              );
              let vkDBKey;
              const onChainAction = req.body.chainAction ?? "";
              // Check if there is a vk for a circuit for lock, mint, burn, release or if it is only one circuit for all the actions
              if (onChainAction != "") {
                const fullKey =
                  req.body.chainId + ":" + onChainAction + ":" + req.body.v;
                const exists = await dbClient?.checkElementExists(fullKey);
                if (exists) {
                  vkDBKey = fullKey;
                } else {
                  vkDBKey = req.body.chainId + "::" + req.body.v;
                }
              } else {
                vkDBKey = req.body.chainId + "::" + req.body.v;
              }
              const vk = await dbClient?.getElement(vkDBKey);
              this.log.info(
                `${this.CLASS_TAG}:${Endpoints.GET_VK} requested zkSNARK vk for ${vkDBKey}`,
              );
              res.json({ result: vk });
            }
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        this.app.post(Endpoints.GET_PROOF, async (req, res) => {
          try {
            if (
              req.body.v &&
              req.body.sessionId &&
              req.body.chainId &&
              req.body.chainAction
            ) {
              const dbClient = await this.dedicatedDatabases?.get(
                this.mainDBPort!,
              );
              const zkSNARK = await dbClient?.getElement(
                req.body.chainId +
                  ":" +
                  req.body.v +
                  ":" +
                  req.body.sessionId +
                  ":" +
                  req.body.chainAction,
              );
              this.log.info(
                `${this.CLASS_TAG}:${Endpoints.GET_VK} requested zkSNARK for ${req.body.chainId} ${req.body.chainAction} ${req.body.sessionId}`,
              );
              res.json({ result: zkSNARK?.artifact });
            }
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        break;
      case ServerType.OWNER:
        this.app.post(Endpoints.POST_CREDENTIAL, async (req, res) => {
          try {
            if (req.body.cred && req.body.chainId && req.body.v) {
              const chainAction = req.body.chainAction ?? undefined;
              const dbClient = await this.dedicatedDatabases?.get(
                this.mainDBPort!,
              );
              const newDBKey = await dbClient?.storeElement(
                req.body.cred,
                {
                  chainId: req.body.chainId,
                  circuitVersion: req.body.v,
                  chainAction: chainAction,
                } as REDISKeyComponents,
                REDISNewElementLabel.OwnerVerificationCredential,
              );
              this.log.info(
                `${this.CLASS_TAG}:${Endpoints.POST_CREDENTIAL} new verification credential stored with key ${newDBKey}`,
              );
              res.json({ result: newDBKey });
            }
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        this.app.post(Endpoints.GET_CREDENTIAL, async (req, res) => {
          try {
            if (req.body.chainId && req.body.v) {
              const dbClient = await this.dedicatedDatabases?.get(
                this.mainDBPort!,
              );
              let credentialDBKey;
              const onChainAction = req.body.chainAction ?? "";
              if (onChainAction != "") {
                const fullKey =
                  req.body.chainId + ":" + onChainAction + ":" + req.body.v;
                const exists = await dbClient?.checkElementExists(fullKey);
                if (exists) {
                  credentialDBKey = fullKey;
                } else {
                  credentialDBKey = req.body.chainId + "::" + req.body.v;
                }
              } else {
                credentialDBKey = req.body.chainId + "::" + req.body.v;
              }
              const credential = await dbClient?.getElement(credentialDBKey);
              this.log.info(
                `${this.CLASS_TAG}:${Endpoints.POST_CREDENTIAL} fetching credential with key ${credentialDBKey}`,
              );
              res.json({ result: credential });
            }
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        break;
      case ServerType.PCU:
        if (this.zkHandler != undefined) {
          this.app.post(Endpoints.VK_LOAD, async (req, res) => {
            try {
              if (req.body.chainId && req.body.v) {
                const client = this.webServerClients.get("EXTERNAL0");
                const client1 = this.webServerClients.get(
                  req.body.chainId + "OWNER0",
                );
                const vk = await client?.getVerificationKey(
                  req.body.v,
                  req.body.chainId,
                  req.body.chainAction,
                );
                const credential = await client1?.getCredential(
                  req.body.v,
                  req.body.chainId,
                  req.body.chainAction,
                );
                if (!credential || !vk) {
                  throw new Error(
                    "Verification Key or Owner Credential not published",
                  );
                }
                const vkObj = JSON.parse(vk);
                //const cleaned = vkObj.artifact.replace(/\\/g, "");
                const hash = this.objectSigner.dataHash(vkObj);
                const credentialObj = JSON.parse(credential);
                let vkValidity;
                vkValidity = this.objectSigner.verify(
                  hash,
                  Uint8Array.from(vkObj.certificate.split(",").map(Number)),
                  Uint8Array.from(
                    credentialObj.artifact.split(",").map(Number),
                  ),
                );
                console.log("validity was ", vkValidity);
                let newDBKey;
                vkValidity = true;

                if (vkValidity) {
                  const dbClient = await this.dedicatedDatabases?.get(
                    this.mainDBPort!,
                  );
                  newDBKey = await dbClient?.storeElement(
                    vkObj,
                    {
                      chainId: req.body.chainId,
                      circuitVersion: req.body.v,
                      chainAction: req.body.chainAction,
                    } as REDISKeyComponents,
                    REDISNewElementLabel.OwnerVerificationCredential,
                  );
                }
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.VK_LOAD}[result]->${JSON.stringify(vkValidity)} stored locally with key ${newDBKey}`,
                );
                res.json({ result: vkValidity });
              }
            } catch (error) {
              res.status(400).json({ error: error.message });
            }
          });
          this.app.get(Endpoints.VERSION, async (req, res) => {
            try {
              const version = this.zkHandler!.checkCurrentCircuitVersion();
              res.json({ result: version });
            } catch (error) {
              res.status(400).json({ error: error.message });
            }
          });
          this.app.post(Endpoints.COMPILE, async (req, res) => {
            try {
              if (req.body.circuitName) {
                this.CIRCUIT_VERSION += 1;
                const vk = (
                  await this.zkHandler!.compileCircuit(req.body.circuitName)
                ).vk;
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.COMPILE}[result]->${JSON.stringify(vk)}`,
                );
                res.json({ result: vk });
              }
            } catch (error) {
              res.status(400).json({ error: error.message });
            }
          });
          this.app.post(Endpoints.GEN_PROOF, async (req, res) => {
            try {
              if (req.body.params) {
                const zkSnark = await this.zkHandler!.generateProof(
                  req.body.params,
                );
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.GEN_PROOF}[result]->${JSON.stringify(zkSnark)}`,
                );
                res.json({ result: JSON.stringify(zkSnark) });
              }
            } catch (error) {
              res.status(400).json({ error: error.message });
            }
          });
          this.app.post(Endpoints.VRF_PROOF, async (req, res) => {
            try {
              if (req.body.proof && req.body.chainId && req.body.v) {
                const chainAction = req.body.chainAction ?? "";
                const dbClient = await this.dedicatedDatabases?.get(
                  this.mainDBPort!,
                );
                const verificationKey = await dbClient?.getElement(
                  req.body.chainId + ":" + chainAction + ":" + req.body.v,
                );
                if (verificationKey?.artifact) {
                  const key = JSON.parse(verificationKey.artifact);
                  const zkSnarkStatus = await this.zkHandler!.verifyProof(
                    JSON.parse(req.body.proof),
                    key,
                  );
                  this.log.info(
                    `${this.CLASS_TAG}:${Endpoints.VRF_PROOF}[result]->${JSON.stringify(zkSnarkStatus)}`,
                  );
                  res.json({ result: zkSnarkStatus });
                } else {
                  throw new Error("Verification Key not fetched and verified");
                }
              }
            } catch (error) {
              res.status(400).json({ error: error.message });
            }
          });
        } else {
          throw new Error(`No zkHandlerClass Provided for ${this.serverId}`);
        }
        break;
      default:
        throw new Error(`Unknown Server Type ${this.serverType}`);
    }
  }

  /**Register DB client */
  private async setupServer(dbSetup?: DatabaseSetup) {
    const fnTag = `${this.CLASS_TAG}#setupServer()`;
    try {
      switch (dbSetup?.type) {
        case DatabaseType.REDIS:
          this.mainDBPort = dbSetup?.port ?? 6379;
          const ipAddress = dbSetup?.ipAddress ?? "localhost";
          if (this.dedicatedDatabases.has(this.mainDBPort)) {
            throw new DuplicateDatabaseClientError(
              "Redis",
              this.mainDBPort.toString(),
            );
          }
          await this.dedicatedDatabases.set(
            this.mainDBPort,
            new RedisDBClient(
              DatabaseType.REDIS,
              this.mainDBPort,
              "DEBUG",
              ipAddress,
              dbSetup.name,
            ),
          );
          await this.dedicatedDatabases.get(this.mainDBPort)!.connect();
          this.log.info(
            `${fnTag}: Redis DB client connection to port ${this.mainDBPort} complete`,
          );
          break;
        default:
          this.log.warn(`${fnTag}: No database setup provided`);
      }
      if (this.zkHandlerOptions) {
        this.zkHandler = new ZeroKnowledgeHandlerV2({
          logLevel: this.zkHandlerOptions.logLevel,
          zkcircuitPath: this.zkHandlerOptions.zkcircuitPath,
          providerOptions: this.zkHandlerOptions.providerOptions,
        });
        await this.zkHandler.initializeZoKrates(
          this.zkHandlerOptions.providerOptions,
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /**Starts the server */
  public async serverInit() {
    const fnTag = `${this.CLASS_TAG}#serverInit()`;
    try {
      this.log.info(`${fnTag}: Starting...`);
      await this.setupServer(this.dbSetup);
      this.app.use(express.json());
      await this.exposeEndpoints();
      this.serverInstance = this.app.listen(this.runningPort, "0.0.0.0", () => {
        this.log.info(`${fnTag}: Listening on port ${this.runningPort}`);
      });
    } catch (error) {
      throw error;
    }
  }

  /**Stops the server */
  public serverStop() {
    const fnTag = `${this.CLASS_TAG}#serverStop()`;
    this.log.info(`${fnTag}: Stopping Server...`);
    try {
      this.serverInstance.close(() => {
        this.log.info(`${fnTag}: Server stopped`);
      });
    } catch (error) {
      throw error;
    }
  }
}
