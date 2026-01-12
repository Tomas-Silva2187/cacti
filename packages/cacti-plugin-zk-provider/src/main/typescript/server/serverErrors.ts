export class ServerError extends Error {
  constructor(message: string, name: string = "ZKServerError") {
    super(name + ": " + message);
    this.name = name;
    this.message = message;
  }
}

export class DuplicateDatabaseClientError extends ServerError {
  constructor(dbType: string, port: string) {
    super(
      `A client for ${dbType} database on port ${port} already exists`,
      "DuplicateDatabaseClientError",
    );
  }
}
