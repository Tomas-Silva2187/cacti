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
}

export class GetEndpoint extends BasicEndpoint {}

export class PostEndpoint extends BasicEndpoint {}
