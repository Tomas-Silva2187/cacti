import {
  BlacklistedServiceError,
  UnknownServiceError,
} from "./errors/endpoint-errors";

export interface Service {
  action: string;
  callElements: object;
}

export class BasicEndpoint {
  public static readonly endpointName: string;
  private serviceProvider: any;
  private endpointServices: Record<string, Service> = {};
  private blackListedServices: string[] = [];

  constructor(service: any) {
    this.serviceProvider = service;
  }

  public setServiceCall(
    actionName: string,
    action: any,
    callElements: object,
  ): void {
    this.endpointServices[actionName] = { action, callElements };
  }

  public executeServiceCall(actionName: string, args: any[]): any {
    if (this.blackListedServices.includes(actionName)) {
      throw new BlacklistedServiceError(actionName);
    } else if (!this.endpointServices[actionName]) {
      throw new UnknownServiceError(actionName);
    } else {
      const answer = (this.serviceProvider as any)[
        this.endpointServices[actionName].action
      ](...args);
      return answer;
    }
  }
}

export class GetEndpoint extends BasicEndpoint {}

export class PostEndpoint extends BasicEndpoint {}
