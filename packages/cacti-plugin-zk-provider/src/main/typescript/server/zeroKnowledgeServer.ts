import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import {
  Endpoint,
  EndpointCallType,
  EndpointSetup,
} from "../endpoints/endpoint.js";
import {
  ZeroKnowledgeHandler,
  ZeroKnowledgeProviderOptions,
} from "../zk-actions/zoKratesHandler.js";
import express from "express";
import { RedisDBClient } from "../database/redisDBClient.js";
import {
  DatabaseType,
  ZKDatabaseClient,
  ZKSnarkCircuit,
} from "../database/zkDatabase.js";
import {
  DuplicateDatabaseClientError,
  FailedToLoadCircuitError,
  IncompleteEndpointDataError,
  NoRequestCallDataError,
  OverwritingDefinedCircuitError,
  VerificationMethodNotSupportedError,
} from "./serverErrors.js";
import { join } from "path";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "fs";

import { createHash } from "crypto";
import { ZeroKnowledgeClient } from "./zeroKnowledgeClient.js";
import { FetchData, RequestTarget } from "../utils.js";

export interface DatabaseSetup {
  type: DatabaseType;
  port?: number;
  ipAddress?: string;
}

export enum VerificationMethod {
  HASH = "HASH",
  SIGNATURE = "SIGNATURE",
  CERTIFICATE = "CERTIFICATE",
}

export interface ServerSetup {
  zeroKnowledgeCircuitPath: string;
  logLevel: LogLevelDesc;
  setupServices: EndpointSetup[];
  serverPort?: number;
  databaseSetup?: DatabaseSetup;
  zkProviderOptions?: ZeroKnowledgeProviderOptions;
  serverId?: string;
}

export interface ZeroKnowledgeProvider {
  zeroKnowledgeProviderClass: ZeroKnowledgeHandler;
  circuitFileExtension: string;
}

export class ZeroKnowledgeServer {
  private zeroknowledgehandler: ZeroKnowledgeHandler;
  protected serverEndpoints: Endpoint[] = [];
  private log: Logger;
  private runningPort: number;
  private app = express();
  private serverInstance: any;
  private dedicatedDatabases = new Map<number, ZKDatabaseClient>();
  private mainDBPort: number | undefined;
  private servicesSetup: EndpointSetup[];
  private dbSetup: DatabaseSetup | undefined;
  private readonly CLASS_TAG: string;
  private circuitStoragePath: string;
  private circuitExtension: string;
  private serverId: string;

  private zkProviderOptions?: ZeroKnowledgeProviderOptions;

  constructor(
    setupOptions: ServerSetup,
    serverProviderClass?: ZeroKnowledgeProvider,
  ) {
    try {
      this.serverId = setupOptions.serverId ?? "default-zk-server";
      this.CLASS_TAG = `#ZeroKnowledgeServer[${this.serverId}]`;
      const fnTag = `${this.CLASS_TAG}#constructor()`;
      this.log = LoggerProvider.getOrCreate({
        label: "ZeroKnowledgeServer",
        level: setupOptions.logLevel,
      });

      if (serverProviderClass == undefined) {
        this.log.info(`${fnTag} Setting Server with Default ZoKrates Handler`);
        this.zeroknowledgehandler = new ZeroKnowledgeHandler({
          logLevel: setupOptions.logLevel,
          zkcircuitPath: setupOptions.zeroKnowledgeCircuitPath,
          providerOptions: setupOptions.zkProviderOptions,
        });
        this.circuitExtension = ".zok";
      } else {
        this.log.info(`${fnTag} Setting Server with Custom Class`);
        this.zeroknowledgehandler =
          serverProviderClass.zeroKnowledgeProviderClass;
        this.circuitExtension = serverProviderClass.circuitFileExtension;
      }
      this.circuitStoragePath = setupOptions.zeroKnowledgeCircuitPath;
      this.runningPort = setupOptions.serverPort ?? 3000;
      this.servicesSetup = setupOptions.setupServices;
      this.dbSetup = setupOptions.databaseSetup;
    } catch (error) {
      throw error;
    }
  }

  private async gatherDBInputs(
    requestParameters: any[],
    redirecting: boolean = false,
  ): Promise<any[]> {
    try {
      const preparedParams: any[] = [];
      for (const reqElement of requestParameters) {
        if ("fetchAt" in reqElement && "key" in reqElement) {
          const dbClient = await this.dedicatedDatabases?.get(
            Number(reqElement.fetchAt),
          );
          const element = await dbClient?.getObject(reqElement.key);
          if (element != null) {
            preparedParams.push(JSON.parse(element!));
          }
        } else if ("circuitName" in reqElement && redirecting) {
          const circuitCode = readFileSync(
            join(
              this.circuitStoragePath,
              `${reqElement.circuitName}${this.circuitExtension}`,
            ),
            "utf-8",
          );
          preparedParams.push({ circuitSource: circuitCode });
        } else {
          preparedParams.push(reqElement);
        }
      }
      return preparedParams;
    } catch (error) {
      throw error;
    }
  }

  private verifyCircuitCredential(
    verificationMethod: VerificationMethod,
    credentials: string,
    data: string,
  ): boolean {
    const fnTag = `${this.CLASS_TAG}#verifyCircuitCredential()`;
    switch (verificationMethod) {
      case VerificationMethod.HASH:
        this.log.info(`${fnTag} Verifying loaded circuit using HASH method`);
        const hash = createHash("sha256").update(data).digest("hex");
        return hash == credentials;
      default:
        throw new VerificationMethodNotSupportedError(verificationMethod);
    }
  }

  private async loadCircuit(
    circuitID: string,
    verificationMethod: VerificationMethod = VerificationMethod.HASH,
    fetchData: FetchData = { infrastructureElement: RequestTarget.DB },
  ) {
    const fnTag = `${this.CLASS_TAG}#loadCircuit()`;
    let circuitCode: ZKSnarkCircuit | undefined;
    this.log.info(`${fnTag}: Loading circuit...`);
    switch (fetchData.infrastructureElement) {
      case RequestTarget.DB:
        this.log.info(
          `${fnTag}: Fetching circuit ${circuitID} by direct DB fetching...`,
        );
        const dbClient = await this.dedicatedDatabases?.get(this.mainDBPort!);
        circuitCode = await dbClient?.getCircuit(circuitID);
        break;
      case RequestTarget.SERVER:
        if (fetchData.url != undefined) {
          this.log.info(
            `${fnTag}: Fetching circuit ${circuitID} by server request...`,
          );
          const zkClient = new ZeroKnowledgeClient(
            fetchData.url.port,
            fetchData.url.ip,
          );
          circuitCode = await zkClient.fetchCircuit(circuitID);
        } else {
          throw new Error(
            `${fnTag}: Missing URL information for SERVER fetch type`,
          );
        }
        break;
      default:
        throw new Error(
          `${fnTag}: Unsupported fetch method ${fetchData.infrastructureElement}`,
        );
    }
    if (circuitCode === undefined || circuitCode === null) {
      throw new FailedToLoadCircuitError(circuitID);
    }
    if (!existsSync(this.circuitStoragePath)) {
      mkdirSync(this.circuitStoragePath, { recursive: true });
    }
    const validateCircuit = this.verifyCircuitCredential(
      verificationMethod,
      circuitCode.circuitCredentials,
      circuitCode.circuitCode,
    );
    this.log.info(`${fnTag}: Circuit validity is ${validateCircuit}`);
    if (
      !existsSync(
        join(
          this.circuitStoragePath,
          `${circuitID.split(":")[0]}${this.circuitExtension}`,
        ),
      ) &&
      validateCircuit
    ) {
      this.log.info(
        `${fnTag}: Storing circuit file ${circuitID.split(":")[0]}${this.circuitExtension}...`,
      );
      writeFileSync(
        join(
          this.circuitStoragePath,
          `${circuitID.split(":")[0]}${this.circuitExtension}`,
        ),
        circuitCode!.circuitCode,
      );
      return "ACK";
    } else {
      if (validateCircuit) {
        this.log.warn(
          `${fnTag}: Circuit file ${circuitID}.zok already loaded.`,
        );
        return "ACK";
      } else {
        throw new OverwritingDefinedCircuitError(circuitID);
      }
    }
  }

  /**  */
  public exposeEndpoints() {
    this.app.post("/loadCircuit", async (req, res) => {
      try {
        if (req.body.circuitID && req.body.verificationMethod) {
          this.log.info(
            `${this.CLASS_TAG} Loading circuit ${req.body.circuitID} locally`,
          );
          const result = await this.loadCircuit(
            req.body.circuitID,
            req.body.verificationMethod,
            req.body.fetchData,
          );
          res.json({ result });
        }
      } catch (error) {
        throw error;
      }
    });
    this.app.post("/fetchCircuit", async (req, res) => {
      try {
        if (req.body.circuitID) {
          this.log.info(
            `${this.CLASS_TAG} Fetching circuit ${req.body.circuitID} from dedicated DB`,
          );
          const dbClient = await this.dedicatedDatabases?.get(this.mainDBPort!);
          const circuit = await dbClient?.getCircuit(req.body.circuitID);
          res.json({ result: circuit });
        }
      } catch (error) {
        throw error;
      }
    });
    const endpointsToSetup = this.serverEndpoints;
    for (const endpoint of endpointsToSetup) {
      try {
        const endpointProperties = endpoint.getEndpointServiceCallProperties();
        if (
          endpointProperties != undefined &&
          endpointProperties.endpointName != undefined &&
          endpointProperties.endpointCallType != undefined
        ) {
          switch (endpointProperties.endpointCallType) {
            case EndpointCallType.GET:
              this.app.get(
                "/" + endpointProperties.endpointName!,
                async (req, res) => {
                  try {
                    this.log.info(
                      `${this.CLASS_TAG} Received request for endpoint ${endpointProperties.endpointName!}`,
                    );
                    const result = await endpoint.executeService(
                      endpointProperties.endpointName!,
                      [],
                    );
                    res.json({ result });
                  } catch (error) {
                    throw error;
                  }
                },
              );
              break;
            case EndpointCallType.POST:
              this.app.post(
                "/" + endpointProperties.endpointName!,
                async (req, res) => {
                  this.log.info(
                    `${this.CLASS_TAG} Received request for endpoint ${endpointProperties.endpointName!}`,
                  );
                  if (req.body.params) {
                    let result;
                    const redirectInfo = endpoint.getRedirectURL();
                    const params = await this.gatherDBInputs(
                      req.body.params,
                      redirectInfo != undefined,
                    );
                    if (redirectInfo != undefined) {
                      this.log.info(
                        `${this.CLASS_TAG} Redirecting request to ${redirectInfo.ip}:${redirectInfo.port}`,
                      );
                      const subClient = new ZeroKnowledgeClient(
                        redirectInfo.port,
                        redirectInfo.ip,
                      );
                      result = await subClient.blindRequest(
                        endpointProperties.endpointName!,
                        params,
                      );
                    } else {
                      this.log.info(
                        `${this.CLASS_TAG} Executing service locally`,
                      );
                      result = await endpoint.executeService(
                        endpointProperties.endpointName!,
                        params,
                      );
                    }
                    if (req.body.store) {
                      result = await this.dedicatedDatabases
                        ?.get(req.body.store)
                        ?.storeObject(JSON.stringify(result));
                    }
                    this.log.info(
                      `${this.CLASS_TAG}:${endpointProperties.endpointName!}->${JSON.stringify(result)}`,
                    );
                    res.json({ result });
                  } else {
                    throw new NoRequestCallDataError(
                      endpointProperties.endpointName!,
                    );
                  }
                },
              );
              break;
            default:
              this.log.warn(`${this.CLASS_TAG} Unsupported call format`);
          }
        } else {
          throw new IncompleteEndpointDataError(
            endpointProperties?.endpointName ?? "Null",
            endpointProperties?.endpointCallType ?? "Null",
          );
        }
      } catch (error) {
        throw error;
      }
    }
  }

  /**Register Endpoints and DB client */
  private async setupServer(
    endpointSetupList: EndpointSetup[],
    dbSetup?: DatabaseSetup,
  ) {
    const fnTag = `${this.CLASS_TAG}#setupServer()`;
    try {
      for (const endpointParameters of endpointSetupList) {
        const endpoint = new Endpoint(this.zeroknowledgehandler);
        endpoint.setupEndpoint(endpointParameters);
        this.serverEndpoints.push(endpoint);
      }
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
    } catch (error) {
      throw error;
    }
  }

  /**Starts the server */
  public async serverInit() {
    const fnTag = `${this.CLASS_TAG}#serverInit()`;
    try {
      this.log.info(`${fnTag}: Starting...`);
      await this.setupServer(this.servicesSetup, this.dbSetup);
      if (this.zeroknowledgehandler instanceof ZeroKnowledgeHandler) {
        await this.zeroknowledgehandler.initializeZoKrates(
          this.zkProviderOptions,
        );
      }
      this.app.use(express.json());
      this.exposeEndpoints();
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
