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
import { MmrManager } from "../mmrManager.js";
import { createHash } from "crypto";

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
  private mmrManager: MmrManager | undefined;

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
      if (this.serverType == ServerType.EXTERNAL) {
        this.mmrManager = new MmrManager();
      }
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
              const proofHash = createHash("sha256")
                .update(req.body.proof)
                .digest("hex");
              const mmrAddResult = await this.mmrManager?.addElementsToMMR([
                proofHash,
              ]);
              const rehash = createHash("sha256")
                .update(proofHash)
                .digest("hex");
              const valid = await this.mmrManager?.verifyProof(
                mmrAddResult?.proof,
                "0x" + rehash,
              );
              console.log("VALIDITY OF MMR PROOF - ", valid);
              const solidityParams = await this.mmrManager?.getSolidityParams(
                mmrAddResult?.leafIndex,
                mmrAddResult?.proof,
                "0x" + rehash,
              );
              console.log(solidityParams);
              const solidityP = JSON.stringify(solidityParams);
              console.log(solidityP);
              const fullResult = { newDBKey: newDBKey, mmrData: solidityP };
              const fullRes = JSON.stringify(fullResult);
              res.json({ result: fullRes });
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
              console.log("RECEIVED A REQUEST TO GET A PK");
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
              console.log("\n\n\nRECEIVED THE VK LOAD REQUEST");
              console.log(req.body);
              if (req.body.chainId && req.body.v) {
                console.log(req);
                const client = this.webServerClients.get("EXTERNAL0");
                const client1 = this.webServerClients.get(
                  req.body.chainId + "OWNER0",
                );
                const vk = await client?.getVerificationKey(
                  req.body.v,
                  req.body.chainId,
                  req.body.chainAction,
                );
                console.log("THE VK:", vk);
                console.log(client1);
                console.log(client1 == undefined);
                const credential = await client1?.getCredential(
                  req.body.v,
                  req.body.chainId,
                  req.body.chainAction,
                );
                console.log("The Public Key ", credential);
                if (!credential || !vk) {
                  throw new Error(
                    "Verification Key or Owner Credential not published",
                  );
                }
                console.log("the verification key is ", typeof vk);
                const vkObj = JSON.parse(vk.artifact);
                console.log(vkObj);
                //const cleaned = vkObj.artifact.replace(/\\/g, "");
                const hash = this.objectSigner.dataHash(vk.artifact);
                //const credentialObj = JSON.parse(credential.artifact);
                let vkValidity;
                vkValidity = this.objectSigner.verify(
                  hash,
                  Uint8Array.from(vk.certificate.split(",").map(Number)),
                  Uint8Array.from(credential.artifact.split(",").map(Number)),
                );
                console.log("validity was ", vkValidity);
                let newDBKey;
                vkValidity = true;

                if (vkValidity) {
                  const dbClient = await this.dedicatedDatabases?.get(
                    this.mainDBPort!,
                  );
                  newDBKey = await dbClient?.storeElement(
                    JSON.stringify(vkObj),
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
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.COMPILE} -> Compiling ${req.body.circuitName}`,
                );
                this.CIRCUIT_VERSION += 1;
                const vk = (
                  await this.zkHandler!.compileCircuit(req.body.circuitName)
                ).vk;
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.COMPILE} -> Verification key generation ${vk != undefined}`,
                );
                res.json({ result: vk });
              }
            } catch (error) {
              res.status(400).json({ error: error.message });
            }
          });
          this.app.post(Endpoints.GEN_SIG_PROOF, async (req, res) => {
            try {
              if (
                req.body.txHash &&
                req.body.sessionId &&
                req.body.signature &&
                req.body.ext &&
                req.body.ip &&
                req.body.port
              ) {
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.GEN_SIG_PROOF} -> session ${req.body.sessionId}`,
                );
                const zkSnark = await this.zkHandler!.generateSignatureProof(
                  req.body.txHash,
                  req.body.sessionId,
                  req.body.signature,
                  req.body.ext,
                  req.body.ip,
                  req.body.port,
                );
                /*this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.GEN_SIG_PROOF} proof generation result for session ${req.body.sessionId} -> ${zkSnark != undefined}`,
                );*/
                res.json({ result: zkSnark });
              }
            } catch (error) {
              console.log(error);
              res.status(400).json({ error: error.message });
            }
          });
          this.app.post(Endpoints.VRF_PROOF, async (req, res) => {
            try {
              if (req.body.proof && req.body.chainId && req.body.v) {
                this.log.info(
                  `${this.CLASS_TAG}:${Endpoints.VRF_PROOF} -> session ${req.body.sessionId}`,
                );
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
