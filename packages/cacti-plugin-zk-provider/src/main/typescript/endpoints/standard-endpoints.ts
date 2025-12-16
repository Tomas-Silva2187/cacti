import {
  BlacklistedServiceError,
  OverwriteServiceError,
  UnknownServiceError,
} from "./errors/endpoint-errors";

export enum EndpointConnectionType {
  HTTP = "HTTP",
  HTTPS = "HTTPS",
  MTLS = "MTLS",
}

export enum EndpointCallType {
  GET = "GET",
  POST = "POST",
}

export interface Service {
  serviceName: string; // The name to be associated to the respective endpoint
  action: string; // Name of the function/method to be executed in the service provider class
  callElements: object;
  endpointCallType: EndpointCallType; // Type of the endpoint call (GET, POST, etc.)
}

export interface ServiceCallProperties {
  endpointCallType: EndpointCallType;
  serviceName: string;
}

export interface EndpointSetup {
  // Service provided by the Endpoint
  endpointService: Service;

  // Blacklisted services for this Endpoint
  blackListedServices?: string[];
}

export class BasicEndpoint {
  public static readonly endpointName: string;
  private serviceProvider: any;
  private endpointService?: Service;
  private blackListedServices?: string[] = [];
  private connectionType?: EndpointConnectionType;

  constructor(endpointServiceProvider: any) {
    this.serviceProvider = endpointServiceProvider;
  }

  public getEndpointServiceCallProperties(): ServiceCallProperties | undefined {
    if (!this.endpointService) {
      return undefined;
    }
    return {
      endpointCallType: this.endpointService.endpointCallType,
      serviceName: this.endpointService.serviceName,
    } as ServiceCallProperties;
  }

  private setServiceCall(
    actionName: string,
    action: any,
    callElements: object,
    serviceEndpointType: EndpointCallType,
  ): void {
    try {
      if (this.endpointService != undefined) {
        throw new OverwriteServiceError(actionName);
      }
      const spActions = Object.getOwnPropertyNames(
        Object.getPrototypeOf(this.serviceProvider),
      ) as string[];

      if (!spActions.includes(action)) {
        throw new UnknownServiceError(action);
      } else if (
        this.blackListedServices != undefined &&
        this.blackListedServices.includes(action)
      ) {
        throw new BlacklistedServiceError(action);
      }

      this.endpointService = {
        serviceName: actionName,
        action: action,
        callElements: callElements,
        endpointCallType: serviceEndpointType,
      };
    } catch (error) {
      throw error;
    }
  }

  public executeServiceCall(actionName: string, args: any[]): any {
    try {
      if (
        this.blackListedServices != undefined &&
        this.blackListedServices.includes(actionName)
      ) {
        throw new BlacklistedServiceError(actionName);
      } else if (
        !this.endpointService ||
        this.endpointService.serviceName !== actionName
      ) {
        throw new UnknownServiceError(actionName);
      } else {
        const answer = (this.serviceProvider as any)[
          this.endpointService.action
        ](...args);
        return answer;
      }
    } catch (error) {
      throw error;
    }
  }

  public setupEndpoint(setupElements: EndpointSetup): void {
    try {
      if (this.endpointService != undefined) {
        throw new OverwriteServiceError(this.endpointService.serviceName);
      }
      this.blackListedServices = setupElements.blackListedServices;
      this.setServiceCall(
        setupElements.endpointService.serviceName,
        setupElements.endpointService.action,
        setupElements.endpointService.callElements,
        setupElements.endpointService.endpointCallType,
      );
    } catch (error) {
      throw error;
    }
  }
}
