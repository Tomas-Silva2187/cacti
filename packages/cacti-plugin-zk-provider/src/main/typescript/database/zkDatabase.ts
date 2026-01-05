import { DatabaseType } from "../server/zeroKnowledgeServer";

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
  public checkClientId(ip: string, port: number): boolean {
    const id = this.ipAddress + ":" + this.port.toString();
    return id === ip + ":" + port.toString();
  }
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
