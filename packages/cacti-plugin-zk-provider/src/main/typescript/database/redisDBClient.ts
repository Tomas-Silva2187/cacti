import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import { createClient, RedisClientType } from "redis";
import {
  DatabaseType,
  REDISKeyComponents,
  REDISNewElementLabel,
  ZKDatabaseClient,
  ZKSnarkCircuit,
} from "./zkDatabase.js";
import { createHash } from "crypto";
import { UnformattedCircuitError } from "./databaseErrors.js";

export class RedisDBClient extends ZKDatabaseClient {
  private CLASS_NAME;
  private client: RedisClientType;
  private log: Logger;

  constructor(
    dbType: DatabaseType,
    port: number = 6379,
    logLevel: LogLevelDesc = "DEBUG",
    ipAddress?: string,
    name?: string,
  ) {
    super(dbType, port ?? 6379, ipAddress ? ipAddress : "localhost");
    this.CLASS_NAME = name ?? "RedisDBClient";
    this.log = LoggerProvider.getOrCreate({
      label: this.CLASS_NAME,
      level: logLevel,
    });
    this.client = createClient({
      url: `redis://${this.ipAddress}:${this.port}`,
    });
  }

  async connect(): Promise<void> {
    const fnTag = `${this.CLASS_NAME}#connect()`;
    this.log.debug(`${fnTag}: Connecting to Redis server...`);
    try {
      await this.client.connect();
      this.log.info(`${fnTag}: Connected to Redis server successfully.`);
      return;
    } catch (error) {
      this.log.error(`${fnTag}: Error connecting to Redis server: ${error}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const fnTag = `${this.CLASS_NAME}#disconnect()`;
    this.log.debug(`${fnTag}: Disconnecting from Redis server...`);
    try {
      await this.client.quit();
      this.log.info(`${fnTag}: Disconnected from Redis server successfully.`);
    } catch (error) {
      this.log.error(
        `${fnTag}: Error disconnecting from Redis server: ${error}`,
      );
      throw error;
    }
  }

  /**\
   * Generates a new key for a specific type of element in REDIS:
   * * DBKey for a verification key
   * * DBKey for verification public key
   * * DBKey for a zkSNARK proving key
   * * DBKey for a zkSNARK
   */
  private generateNewElementKey(
    keyElements: REDISKeyComponents,
    newElementLabel: REDISNewElementLabel,
  ) {
    const on_chain_action = keyElements.chainAction ?? "";
    console.log(keyElements);
    switch (newElementLabel) {
      case REDISNewElementLabel.VerificationKey:
        if (keyElements.chainId && keyElements.circuitVersion) {
          return (
            keyElements.chainId +
            ":" +
            on_chain_action +
            ":" +
            keyElements.circuitVersion
          );
        }
      case REDISNewElementLabel.OwnerVerificationCredential:
        if (keyElements.chainId && keyElements.circuitVersion) {
          return (
            keyElements.chainId +
            ":" +
            on_chain_action +
            ":" +
            keyElements.circuitVersion
          );
        }
      case REDISNewElementLabel.ProvingKey:
        if (keyElements.chainId && keyElements.chainAction) {
          return (
            keyElements.chainId +
            ":" +
            on_chain_action +
            ":" +
            keyElements.chainAction
          );
        }
      case REDISNewElementLabel.ZKSNARK:
        if (
          keyElements.chainId &&
          keyElements.sessionId &&
          keyElements.circuitVersion
        ) {
          return (
            keyElements.sessionId +
            ":" +
            on_chain_action +
            ":" +
            keyElements.circuitVersion
          );
        }
      default:
        throw new Error("Insufficient parameters for key generation");
    }
  }

  /**
   * Stores a data object in Redis with hash as key, and returns the key.
   */
  async storeObject(objectToStore: string) {
    const fnTag = `${this.CLASS_NAME}#storeObject()`;
    try {
      const key = createHash("sha256").update(objectToStore).digest("hex");
      this.log.info(`${fnTag}: Storing operation result with key ${key}...`);
      await this.client.hSet(`sha256: ${key}`, {
        result: objectToStore,
      });
      this.log.info(`${fnTag}: Operation result stored successfully.`);
      return key;
    } catch (error) {
      throw error;
    }
  }

  async storeElement(
    element: string,
    keyComponents: REDISKeyComponents,
    newElementLabel: REDISNewElementLabel,
    certificate?: string,
  ) {
    const fnTag = `${this.CLASS_NAME}#storeElement()`;

    try {
      const newElementStorageKey = this.generateNewElementKey(
        keyComponents,
        newElementLabel,
      );
      this.log.info(
        `${fnTag}: Storing Verification Key for ${newElementStorageKey}`,
      );
      if (!certificate) {
        this.log.info(`${fnTag}: Storing ${element}`);
        await this.client.hSet(newElementStorageKey, { artifact: element });
      } else {
        await this.client.hSet(newElementStorageKey, {
          artifact: element,
          credential: certificate,
        });
        this.log.info(`${fnTag}: Storing ${element} with ${certificate}`);
      }
      return newElementStorageKey;
    } catch (error) {
      throw error;
    }
  }

  async getElement(dbKey: string) {
    const fnTag = `${this.CLASS_NAME}#getElement()`;
    this.log.info(
      `${fnTag}: Fetching element ${dbKey} from ${this.ipAddress}:${this.port}`,
    );
    try {
      const element = await this.client.hGet(dbKey, "artifact");
      const certificate = await this.client.hGet(dbKey, "credential");
      return { artifact: element, certificate: certificate ?? "" };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves a data object from Redis using the provided key.
   */
  async getObject(key: string): Promise<string | null> {
    const fnTag = `${this.CLASS_NAME}#getObject()`;
    this.log.info(`${fnTag}: Fetching data with key: ${key}`);
    try {
      const data = await this.client.hGet(`sha256: ${key}`, "result");
      return data ?? null;
    } catch (error) {
      throw error;
    }
  }

  async getCircuit(key: string): Promise<ZKSnarkCircuit> {
    const fnTag = `${this.CLASS_NAME}#getCircuit()`;
    this.log.info(`${fnTag}: Fetching data with key: ${key}`);
    try {
      const data = await this.client.hGetAll(key);
      if (!data || !data.circuitCode || !data.circuitCredentials) {
        throw new UnformattedCircuitError("REDIS");
      }
      return {
        circuitCode: data.circuitCode,
        circuitCredentials: data.circuitCredentials,
      } as ZKSnarkCircuit;
    } catch (error) {
      throw error;
    }
  }

  async checkElementExists(dbKey: string) {
    try {
      const exists = await this.client.exists(dbKey);
      if (exists == 1) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      throw error;
    }
  }
}
