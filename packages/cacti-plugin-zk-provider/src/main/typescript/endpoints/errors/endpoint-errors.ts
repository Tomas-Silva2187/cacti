export class EndpointError extends Error {
  constructor(
    public message: string,
    public name: string = "EndpointError",
    public cause: string | Error | null = null,
    public code: number = 500,
  ) {
    super(name + ": " + message);
    this.name = name;
    this.message = message;
    this.cause = cause;
    this.code = code;
  }
}

export class BlacklistedServiceError extends EndpointError {
  constructor(message: string, cause?: string | Error | null) {
    super(
      `Blacklisted service ${message}`,
      "BlacklistedServiceError",
      cause ?? null,
      500,
    );
  }
}

export class UnknownServiceError extends EndpointError {
  constructor(message: string, cause?: string | Error | null) {
    super(
      `Unknown service ${message}`,
      "UnknownServiceError",
      cause ?? null,
      500,
    );
  }
}
