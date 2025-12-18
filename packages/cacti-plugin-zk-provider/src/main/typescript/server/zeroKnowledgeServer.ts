import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import {
  BasicEndpoint,
  EndpointCallType,
  EndpointSetup,
} from "../endpoints/standard-endpoints";
import {
  ZeroKnowledgeHandler,
  ZeroKnowledgeProviderOptions,
} from "../zk-actions/zoKratesHandler";
import express from "express";
import { RedisDB } from "../database/redisDB";
import { ZKDatabase } from "../database/zkDatabase";

export enum DatabaseType {
  REDIS = "REDIS",
  MYSQL = "MYSQL",
}

export interface DatabaseSetup {
  type: DatabaseType;
  port: number;
  local_launch?: boolean;
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
  private serverEndpoints: BasicEndpoint[] = [];
  private log: Logger;
  private runningPort: number;
  private app = express();
  private serverInstance: any;
  private dedicatedDatabase: Map<number, ZKDatabase> | undefined;
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

  public setupEndpoints(setupList: EndpointSetup[]) {
    for (const setupItem of setupList) {
      const endpoint = new BasicEndpoint(this.zeroknowledgehandler);
      endpoint.setupEndpoint(setupItem);
      this.serverEndpoints.push(endpoint);
    }
  }

  private async setupServer(
    setupList: EndpointSetup[],
    dbSetup?: DatabaseSetup,
  ) {
    this.setupEndpoints(setupList);
    switch (dbSetup?.type) {
      case DatabaseType.REDIS:
        this.setupRedisDB(dbSetup.port);
        break;
      case DatabaseType.MYSQL:
        this.setupMySqlDB();
        break;
      default:
        this.log.warn("No database setup selected");
    }
  }

  private setupRedisDB(port?: number) {
    if (port === undefined) {
      this.log.debug("No port provided for Redis DB, using REDIS default port");
      port = 6379;
    } else {
      this.log.info(`Setting up Redis DB on port ${port}`);
    }
    try {
      if (this.dedicatedDatabase === undefined) {
        this.dedicatedDatabase = new Map<number, ZKDatabase>();
      }
      if (this.dedicatedDatabase.has(port)) {
        throw new Error(`Port ${port} is already assigned to another database`);
      }
      this.dedicatedDatabase.set(port, new RedisDB(DatabaseType.REDIS, port));
      this.dedicatedDatabase.get(port)?.connect();
      this.log.info("Redis DB setup complete");
    } catch (error) {
      this.log.error(`Error setting up Redis DB: ${error}`);
      throw error;
    }
  }

  private setupMySqlDB() {
    // Placeholder for MySQL DB setup logic
    this.log.info("MySQL DB setup complete");
  }

  public endpointInit(endpointSelection?: BasicEndpoint[]) {
    const endpointsToSetup =
      endpointSelection != undefined ? endpointSelection : this.serverEndpoints;
    for (const endpoint of endpointsToSetup) {
      try {
        const endpointProperties = endpoint.getEndpointServiceCallProperties();
        switch (endpointProperties?.endpointCallType) {
          case EndpointCallType.GET:
            this.app.get(
              "/" + endpointProperties.serviceName,
              async (req, res) => {
                try {
                  const result = await endpoint.executeServiceCall(
                    endpointProperties.serviceName,
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
              "/" + endpointProperties.serviceName,
              async (req, res) => {
                try {
                  const result = await endpoint.executeServiceCall(
                    endpointProperties.serviceName,
                    req.body,
                  );
                  console.log(result);
                  res.json({ result });
                } catch (error) {
                  this.log.error(error);
                  throw error;
                }
              },
            );
            break;
          default:
            this.log.warn(
              `Unknown endpoint call type for service ${endpoint["endpointService"]?.serviceName}`,
            );
        }
      } catch (error) {
        this.log.error(error);
        throw error;
      }
    }
    this.app.post("/publishCircuit", async (req, res) => {
      try {
        const dbClient = await this.dedicatedDatabase?.get(req.body.port);
        if (dbClient === undefined) {
          throw new Error(`No database client found for port ${req.body.port}`);
        }
        let result;
        switch (dbClient.getDatabaseType()) {
          case DatabaseType.REDIS:
            result = (dbClient as RedisDB).storeCircuit(req.body.circuit);
            break;
          case DatabaseType.MYSQL:
            this.log.info("Using MySQL DB to store circuit");
            break;
          default:
            throw new Error("Unsupported database type");
        }
        res.json({ result });
      } catch (error) {
        this.log.error(error);
        throw error;
      }
    });
  }

  public async serverInit() {
    if (this.zeroknowledgehandler instanceof ZeroKnowledgeHandler) {
      await this.zeroknowledgehandler.initializeZoKrates(
        this.zkProviderOptions,
      );
    }
    this.app.use(express.json());
    this.endpointInit();
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
