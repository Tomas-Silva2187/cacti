import { DatabaseType } from "../server/zeroKnowledgeServer";

export abstract class ZKDatabase {
  private databaseType: DatabaseType;
  constructor(databaseType: DatabaseType) {
    this.databaseType = databaseType;
  }
  public getDatabaseType(): DatabaseType {
    return this.databaseType;
  }
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
