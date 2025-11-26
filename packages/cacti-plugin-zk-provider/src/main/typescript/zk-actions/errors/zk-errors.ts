export class ZoKratesError extends Error {
  constructor(message: string, name: string = "ZoKratesError") {
    super(name + ": " + message);
    this.name = name;
    this.message = message;
  }
}

export class ZoKratesInitializationError extends ZoKratesError {
  constructor(message: string) {
    super(message, "ZoKratesInitializationError");
  }
}

export class ZoKratesProviderNotInitializedError extends ZoKratesError {
  constructor() {
    super(
      "ZoKrates provider is not initialized",
      "ZoKratesProviderNotInitializedError",
    );
  }
}
export class ZoKratesComputationError extends ZoKratesError {
  constructor(message: string, step: string) {
    super(message, `ZoKratesError@${step}`);
  }
}
