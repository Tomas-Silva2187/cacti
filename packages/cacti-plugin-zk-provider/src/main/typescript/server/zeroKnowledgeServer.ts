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

export enum DatabaseType {
  REDIS = "REDIS",
  MYSQL = "MYSQL",
}

export interface ServerSetup {
  zeroKnowledgeCircuitPath: string;
  logLevel: LogLevelDesc;
  setupServices: EndpointSetup[];
  databaseType?: DatabaseType;
  zkProviderOptions?: ZeroKnowledgeProviderOptions;
}

export class ZeroKnowledgeServer {
  private zeroknowledgehandler: ZeroKnowledgeHandler | any;
  private serverEndpoints: BasicEndpoint[] = [];
  private log: Logger;
  private runningPort: number;
  private app = express();
  private serverInstance: any;
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

    this.setupServer(setupOptions.setupServices, setupOptions.databaseType);
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
    dbSetup?: DatabaseType,
  ) {
    this.setupEndpoints(setupList);
    switch (dbSetup) {
      case DatabaseType.REDIS:
        this.setupRedisDB();
        break;
      case DatabaseType.MYSQL:
        this.setupMySqlDB();
        break;
      default:
        this.log.warn("No database setup selected");
    }
  }

  private setupRedisDB() {
    // Placeholder for Redis DB setup logic
    this.log.info("Redis DB setup complete");
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
