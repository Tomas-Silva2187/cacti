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

export class IncompleteEndpointDataError extends ServerError {
  constructor(name: string, callType: string) {
    super(
      `Trying to setup an endpoint with incomplete data: Name:${name}, CallType:${callType}`,
      "IncompleteEndpointDataError",
    );
  }
}

export class NoRequestCallDataError extends ServerError {
  constructor(endpointName: string) {
    super(
      `Endpoint ${endpointName} called without any data provided`,
      "NoRequestCallDataError",
    );
  }
}

export class OverwritingDefinedCircuitError extends ServerError {
  constructor(circuitID: string) {
    super(
      `Tried to overwrite circuit ${circuitID} using wrong credential`,
      "OverwritingDefinedCircuitError",
    );
  }
}

export class FailedToLoadCircuitError extends ServerError {
  constructor(circuitID: string) {
    super(`Failed to load circuit ${circuitID}`, "FailedToLoadCircuitError");
  }
}
