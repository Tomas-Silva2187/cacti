export class DatabaseError extends Error {
  constructor(message: string, name: string = "DatabaseError") {
    super(name + ": " + message);
    this.name = name;
    this.message = message;
  }
}

export class UnformattedCircuitError extends DatabaseError {
  constructor(dbType: string) {
    super(
      `${dbType} database with null or improperly formatted circuit data`,
      "UnformattedCircuitError",
    );
  }
}