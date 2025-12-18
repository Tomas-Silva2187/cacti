import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import { createClient, RedisClientType } from "redis";
import { spawn, ChildProcess } from "child_process";
import { ZKDatabase } from "./zkDatabase";
import { DatabaseType } from "../server/zeroKnowledgeServer";

export interface RedisDBSetupOptions {
  port: number;
  logLevel?: LogLevelDesc;
}

export interface SNARKGeneratedArtifacts {
  compilationArtifacts?: string;
  witness?: string;
  keypair?: string;
  proof?: string;
}

export interface ZKSnarkCircuit {
  name: string;
  source_code: string;
}

export class RedisDB extends ZKDatabase {
  public static readonly CLASS_NAME = "RedisDB";
  private client: RedisClientType;
  private log: Logger;
  private redisProcess?: ChildProcess;
  private port: number;

  constructor(
    dbType: DatabaseType,
    port: number = 6379,
    logLevel: LogLevelDesc = "DEBUG",
    launch: boolean = false,
  ) {
    super(dbType);
    this.log = LoggerProvider.getOrCreate({
      label: RedisDB.CLASS_NAME,
      level: logLevel,
    });
    this.port = port;
    this.client = createClient({ url: `redis://localhost:${port}` });
    if (launch) {
      this.startServer();
    }
  }

  async startServer(): Promise<void> {
    const fnTag = `${RedisDB.CLASS_NAME}#startServer()`;
    this.log.debug(`${fnTag}: Launching Redis server on port ${this.port}...`);
    if (this.redisProcess) {
      this.log.warn(`${fnTag}: Redis server process already running.`);
      return;
    }
    this.redisProcess = spawn(
      "redis-server",
      ["--port", this.port.toString()],
      {
        stdio: "inherit",
      },
    );
    this.redisProcess.on("error", (err) => {
      this.log.error(`${fnTag}: Failed to start Redis server: ${err}`);
    });
    this.redisProcess.on("exit", (code, signal) => {
      this.log.info(
        `${fnTag}: Redis server exited with code ${code}, signal ${signal}`,
      );
      this.redisProcess = undefined;
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.log.info(`${fnTag}: Redis server launched.`);
  }
  async stopServer(): Promise<void> {
    const fnTag = `${RedisDB.CLASS_NAME}#stopServer()`;
    if (this.redisProcess) {
      this.log.debug(`${fnTag}: Stopping Redis server...`);
      this.redisProcess.kill();
      this.redisProcess = undefined;
      this.log.info(`${fnTag}: Redis server stopped.`);
    } else {
      this.log.debug(`${fnTag}: No Redis server process to stop.`);
    }
  }

  async connect(): Promise<void> {
    const fnTag = `${RedisDB.CLASS_NAME}#connect()`;
    this.log.debug(`${fnTag}: Connecting to Redis server...`);
    try {
      await this.client.connect();
      this.log.info(`${fnTag}: Connected to Redis server successfully.`);
    } catch (error) {
      this.log.error(`${fnTag}: Error connecting to Redis server: ${error}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const fnTag = `${RedisDB.CLASS_NAME}#disconnect()`;
    this.log.debug(`${fnTag}: Disconnecting from Redis server...`);
    try {
      await this.client.quit();
      this.log.info(`${fnTag}: Disconnected from Redis server successfully.`);
      await this.stopServer();
    } catch (error) {
      this.log.error(
        `${fnTag}: Error disconnecting from Redis server: ${error}`,
      );
      throw error;
    }
  }

  async storeCircuit(circuit: ZKSnarkCircuit): Promise<string> {
    const fnTag = `${RedisDB.CLASS_NAME}#storeCircuit()`;
    this.log.debug(`${fnTag}: Storing circuit ${circuit.name}...`);
    try {
      await this.client.hSet(`circuit: ${circuit.name}`, {
        code: circuit.source_code,
      });
      this.log.info(`${fnTag}: Circuit ${circuit.name} stored successfully.`);
      return "ACK";
    } catch (error) {
      this.log.error(`${fnTag}: Error storing circuit: ${error}`);
      throw error;
    }
  }

  async getCircuit(name: string): Promise<string> {
    const fnTag = `${RedisDB.CLASS_NAME}#getCircuit()`;
    this.log.debug(`${fnTag}: Retrieving circuit ${name}...`);
    try {
      const data = await this.client.hGet(`circuit: ${name}`, "code");
      if (!data) {
        this.log.warn(`${fnTag}: Circuit ${name} not found.`);
        return "";
      }
      this.log.info(`${fnTag}: Circuit ${name} retrieved successfully.`);
      return data;
    } catch (error) {
      this.log.error(`${fnTag}: Error retrieving circuit: ${error}`);
      throw error;
    }
  }
}
