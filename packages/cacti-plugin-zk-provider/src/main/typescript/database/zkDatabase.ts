export enum DatabaseType {
  REDIS = 1,
  MYSQL = 2,
}

export interface ZKSnarkCircuit {
  circuitCode: string;
  circuitCredentials: string;
}

export abstract class ZKDatabaseClient {
  protected databaseType: DatabaseType;
  protected port: number;
  protected ipAddress: string = "localhost";
  constructor(databaseType: DatabaseType, port: number, ipAddress: string) {
    this.databaseType = databaseType;
    this.port = port;
    this.ipAddress = ipAddress;
  }
  public getDatabaseType(): DatabaseType {
    return this.databaseType;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract storeObject(objectToStore: string): Promise<string>;
  abstract getObject(key: string): Promise<string | null>;
  abstract getCircuit(key: string): Promise<ZKSnarkCircuit>;
}
