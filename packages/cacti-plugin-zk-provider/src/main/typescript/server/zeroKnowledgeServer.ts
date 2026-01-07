import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import {
  Endpoint,
  EndpointCallType,
  EndpointSetup,
} from "../endpoints/endpoint";
import {
  ZeroKnowledgeHandler,
  ZeroKnowledgeProviderOptions,
} from "../zk-actions/zoKratesHandler";
import express from "express";
import { RedisDBClient } from "../database/redisDBClient";
import { ZKDatabaseClient } from "../database/zkDatabase";

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

  constructor(
    setupOptions: ServerSetup,
    serverProviderClass?: any,
    serverRunningPort?: number,
  ) {
    this.log = LoggerProvider.getOrCreate({
      label: "ZeroKnowledgeServer",
      level: setupOptions.logLevel,
    });
    if (serverProviderClass == undefined) {
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

    this.setupServer(setupOptions.setupServices, setupOptions.databaseSetup);
  }

  private async setupServer(
    endpointSetupList: EndpointSetup[],
    dbSetup?: DatabaseSetup,
  ) {
    for (const endpointData of endpointSetupList) {
      const endpoint = new Endpoint(this.zeroknowledgehandler);
      endpoint.setupEndpoint(endpointData);
      this.serverEndpoints.push(endpoint);
    }
    switch (dbSetup?.type) {
      case DatabaseType.REDIS:
        this.setupRedisDBClient(dbSetup);
        break;
      case DatabaseType.MYSQL:
        this.setupMySqlDBClient();
        break;
      default:
        this.log.warn("No database setup selected");
    }
  }

  private setupRedisDBClient(dbSetup?: DatabaseSetup) {
    const port = dbSetup?.port ?? 6379;
    const ipAddress = dbSetup?.ipAddress ?? "localhost";
    try {
      if (this.dedicatedDatabase === undefined) {
        this.dedicatedDatabase = new Map<number, ZKDatabaseClient>();
      }
      if (this.dedicatedDatabase.has(port)) {
        const storedClient = this.dedicatedDatabase.get(port);
        if (
          storedClient !== undefined &&
          storedClient.checkClientId(ipAddress, port)
        ) {
          throw new Error(`A client for this Redis DB already exists`);
        }
      }
      this.dedicatedDatabase.set(
        port,
        new RedisDBClient(DatabaseType.REDIS, port, "DEBUG", ipAddress),
      );
      this.dedicatedDatabase.get(port)?.connect();
      this.log.info("Redis DB setup complete");
    } catch (error) {
      this.log.error(`Error setting up Redis DB: ${error}`);
      throw error;
    }
  }

  private setupMySqlDBClient() {
    // Placeholder for MySQL DB setup logic
    this.log.info("MySQL DB setup complete");
  }

  private async prepareParams(params: any[]): Promise<any[]> {
    const preparedParams: any[] = [];
    for (const element of params) {
      if ("fetchAt" in element && "key" in element) {
        const client = await this.dedicatedDatabase?.get(
          Number(element.fetchAt),
        );
        const el = await client?.getObject(element.key);
        preparedParams.push(JSON.parse(el!));
      } else {
        preparedParams.push(element);
      }
    }
    return preparedParams;
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
                    if (req.body.params) {
                      let result;
                      const params = await this.prepareParams(req.body.params);
                      result = await endpoint.executeService(
                        endpointProperties.endpointName!,
                        params,
                      );
                      if (req.body.store) {
                        result = await this.dedicatedDatabase
                          ?.get(req.body.store)
                          ?.storeObject(JSON.stringify(result));
                      }
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
