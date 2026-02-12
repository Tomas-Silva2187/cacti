import { ServerUrl } from "../utils.js";
import {
  BlacklistedServiceError,
  OverwriteServiceError,
  UnknownServiceError,
} from "./errors/endpoint-errors.js";

export enum EndpointCallType {
  GET = "GET",
  POST = "POST",
}

/**
 * Endpoints are defined to run a service:
 * - serviceName: each service needs a unique name for its respective endpoint
 * - executeFunction: a service should be responsible for the execution of a single method from the underlying class
 * - endpointCallType: type of the endpoint call (GET, POST, etc.)
 */
export interface EndpointService {
  endpointName: string;
  executeFunction: string;
  endpointCallType: EndpointCallType;
}

export interface EndpointSetup {
  // Service provided by the Endpoint
  endpointService: EndpointService;

  redirectURL?: ServerUrl;

  // Blacklisted services for this Endpoint
  blackListedServices?: string[];
}

export class Endpoint {
  public static readonly endpointName: string;
  private serviceProviderClass: any;
  private endpointService?: EndpointService;
  private blackListedServices?: string[] = [];
  private redirectURL?: ServerUrl;

  constructor(endpointServiceProvider: any) {
    this.serviceProviderClass = endpointServiceProvider;
  }

  public getEndpointServiceCallProperties():
    | Partial<EndpointService>
    | undefined {
    if (!this.endpointService) {
      return undefined;
    }
    return {
      endpointCallType: this.endpointService.endpointCallType,
      endpointName: this.endpointService.endpointName,
    } as Partial<EndpointService>;
  }

  public getRedirectURL(): ServerUrl | undefined {
    return this.redirectURL;
  }

  public setupEndpoint(setupElements: EndpointSetup): void {
    try {
      if (this.endpointService != undefined) {
        throw new OverwriteServiceError(this.endpointService.endpointName);
      }
      this.blackListedServices = setupElements.blackListedServices;
      this.redirectURL = setupElements.redirectURL as ServerUrl;
      const endpointName = setupElements.endpointService.endpointName;
      const executeFunction = setupElements.endpointService.executeFunction;
      const serviceEndpointType =
        setupElements.endpointService.endpointCallType;
      if (this.endpointService != undefined) {
        throw new OverwriteServiceError(endpointName);
      }
      const serviceProviderFunctions = Object.getOwnPropertyNames(
        Object.getPrototypeOf(this.serviceProviderClass),
      ) as string[];

      if (!serviceProviderFunctions.includes(executeFunction)) {
        throw new UnknownServiceError(executeFunction);
      } else if (
        this.blackListedServices != undefined &&
        this.blackListedServices.includes(executeFunction)
      ) {
        throw new BlacklistedServiceError(executeFunction);
      }

      this.endpointService = {
        endpointName: endpointName,
        executeFunction: executeFunction,
        endpointCallType: serviceEndpointType,
      };
    } catch (error) {
      throw error;
    }
  }

  public executeService(actionName: string, args: any[]): any {
    try {
      if (
        this.blackListedServices != undefined &&
        this.blackListedServices.includes(actionName)
      ) {
        throw new BlacklistedServiceError(actionName);
      } else if (
        !this.endpointService ||
        this.endpointService.endpointName !== actionName
      ) {
        throw new UnknownServiceError(actionName);
      } else if (this.redirectURL != undefined) {
        return;
      } else {
        const answer = (this.serviceProviderClass as any)[
          this.endpointService.executeFunction
        ](...args);
        return answer;
      }
    } catch (error) {
      throw error;
    }
  }
}
