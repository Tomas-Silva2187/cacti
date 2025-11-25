export class ZoKratesError extends Error {
  constructor(message: string, name: string = "ZoKratesError") {
    super(name + ": " + message);
    this.name = name;
  }
}

export class ZoKratesInitializationError extends ZoKratesError {
  constructor(message: string) {
    super(message, "ZoKratesInitializationError");
  }
}

export class ZoKratesComputationError extends ZoKratesError {
  constructor(message: string, step: string) {
    super(message, `ZoKratesError@${step}`);
  }
}
