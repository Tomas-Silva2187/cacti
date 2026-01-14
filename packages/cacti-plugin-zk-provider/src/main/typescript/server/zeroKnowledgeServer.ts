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
import { ZKDatabaseClient } from "../database/zkDatabase.js";
import { DuplicateDatabaseClientError } from "./serverErrors.js";

export enum DatabaseType {
  REDIS = 1,
  MYSQL = 2,
}

export interface DatabaseSetup {
  type: DatabaseType;
  port?: number;
  ipAddress?: string;
}

export interface ServerSetup {
  zeroKnowledgeCircuitPath: string;
  logLevel: LogLevelDesc;
  setupServices: EndpointSetup[];
  databaseSetup?: DatabaseSetup;
  zkProviderOptions?: ZeroKnowledgeProviderOptions;
}

export class ZeroKnowledgeServer {
  private zeroknowledgehandler: ZeroKnowledgeHandler | any;
  protected serverEndpoints: Endpoint[] = [];
  private log: Logger;
  private runningPort: number;
  private app = express();
  private serverInstance: any;
  private dedicatedDatabase: Map<number, ZKDatabaseClient> | undefined;
  private zkProviderOptions?: ZeroKnowledgeProviderOptions;
  private servicesSetup: EndpointSetup[];
  private dbSetup: DatabaseSetup | undefined;

  constructor(
    setupOptions: ServerSetup,
    serverProviderClass?: any,
    serverRunningPort?: number,
  ) {
    try {
      this.log = LoggerProvider.getOrCreate({
        label: "ZeroKnowledgeServer",
        level: setupOptions.logLevel,
      });
      if (serverProviderClass == undefined) {
        this.log.info("Setting Server with Default ZoKrates class");
        this.zeroknowledgehandler = new ZeroKnowledgeHandler({
          logLevel: setupOptions.logLevel,
          zkcircuitPath: setupOptions.zeroKnowledgeCircuitPath,
          providerOptions: setupOptions.zkProviderOptions,
        });
        this.zkProviderOptions = setupOptions.zkProviderOptions;
      } else {
        this.log.info("Setting Server with Custom Class");
        this.zeroknowledgehandler = serverProviderClass;
      }

      this.runningPort = serverRunningPort ?? 3000;

      this.servicesSetup = setupOptions.setupServices;
      this.dbSetup = setupOptions.databaseSetup;
    } catch (error) {
      throw error;
    }
  }

  private async setupServer(
    endpointSetupList: EndpointSetup[],
    dbSetup?: DatabaseSetup,
  ) {
    const tag: string = "ZeroKnowledgeServer#setupServer()";
    try {
      for (const endpointData of endpointSetupList) {
        const endpoint = new Endpoint(this.zeroknowledgehandler);
        endpoint.setupEndpoint(endpointData);
        this.serverEndpoints.push(endpoint);
      }
      switch (dbSetup?.type) {
        case DatabaseType.REDIS:
          await this.setupRedisDBClient(dbSetup);
          break;
        case DatabaseType.MYSQL:
          this.setupMySqlDBClient();
          break;
        default:
          this.log.warn(`${tag}: No database setup provided`);
      }
    } catch (error) {
      throw error;
    }
  }

  private async setupRedisDBClient(dbSetup?: DatabaseSetup) {
    const port = dbSetup?.port ?? 6379;
    const ipAddress = dbSetup?.ipAddress ?? "localhost";
    const tag: string = "ZeroKnowledgeServer#setupRedisDBClient()";
    try {
      if (this.dedicatedDatabase === undefined) {
        this.dedicatedDatabase = new Map<number, ZKDatabaseClient>();
      }
      if (this.dedicatedDatabase.has(port)) {
        //const storedClient = this.dedicatedDatabase.get(port);
        //if (
        //  storedClient !== undefined &&
        //  storedClient.checkClientId(ipAddress, port)
        //) {
        throw new DuplicateDatabaseClientError("Redis", port.toString());
        //}
      }
      await this.dedicatedDatabase.set(
        port,
        new RedisDBClient(DatabaseType.REDIS, port, "DEBUG", ipAddress),
      );
      await this.dedicatedDatabase.get(port)?.connect();
      this.log.info(
        `${tag}: Redis DB client connection to port ${port} complete`,
      );
    } catch (error) {
      throw error;
    }
  }

  private setupMySqlDBClient() {
    // Placeholder for MySQL DB setup logic
    throw new Error("MySQL DB setup not implemented yet");
  }

  private async setAndFetchRequestInputs(
    receivedInputs: any[],
  ): Promise<any[]> {
    try {
      const preparedParams: any[] = [];
      for (const element of receivedInputs) {
        if ("fetchAt" in element && "key" in element) {
          const client = await this.dedicatedDatabase?.get(
            Number(element.fetchAt),
          );
          console.log(client!.toString());
          const el = await client?.getObject(element.key);
          preparedParams.push(JSON.parse(el!));
        } else {
          preparedParams.push(element);
        }
      }
      return preparedParams;
    } catch (error) {
      throw error;
    }
  }

  public exposeEndpoints(endpointSelection?: Endpoint[]) {
    const endpointsToSetup =
      endpointSelection != undefined ? endpointSelection : this.serverEndpoints;
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
                  try {
                    this.log.info(
                      `Received request for endpoint ${endpointProperties.endpointName!}`,
                    );
                    if (req.body.params) {
                      let result;
                      const params = await this.setAndFetchRequestInputs(
                        req.body.params,
                      );
                      result = await endpoint.executeService(
                        endpointProperties.endpointName!,
                        params,
                      );
                      if (req.body.store) {
                        result = await this.dedicatedDatabase
                          ?.get(req.body.store)
                          ?.storeObject(JSON.stringify(result));
                      }
                      this.log.info(`Returning result ${result}`);
                      res.json({ result });
                    }
                  } catch (error) {
                    this.log.error(error);
                    throw error;
                  }
                },
              );
              break;
            default:
              this.log.warn(
                `Unknown endpoint call type for service ${endpoint["endpointService"]?.endpointName}`,
              );
          }
        }
      } catch (error) {
        this.log.error(error);
        throw error;
      }
    }
  }

  public async serverInit() {
    await this.setupServer(this.servicesSetup, this.dbSetup);
    if (this.zeroknowledgehandler instanceof ZeroKnowledgeHandler) {
      await this.zeroknowledgehandler.initializeZoKrates(
        this.zkProviderOptions,
      );
    }
    this.app.use(express.json());
    this.exposeEndpoints();
    this.serverInstance = this.app.listen(this.runningPort, () => {
      this.log.info(
        `ZeroKnowledgeServer is listening on port ${this.runningPort}`,
      );
    });
    this.log.info("ZeroKnowledgeServer initialized");
  }

  public serverStop() {
    this.serverInstance.close(() => {
      this.log.info("ZeroKnowledgeServer stopped");
    });
  }
}
