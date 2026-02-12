import * as path from "path";
import { describe, expect, it } from "vitest";
import {
  CircuitLoadSetup,
  ZeroKnowledgeHandler,
  ZeroKnowledgeHandlerOptions,
} from "../../../main/typescript/zk-actions/zoKratesHandler";
import {
  Endpoint,
  EndpointCallType,
} from "../../../main/typescript/endpoints/endpoint";
import {
  BlacklistedServiceError,
  OverwriteServiceError,
} from "../../../main/typescript/endpoints/errors/endpoint-errors";

describe("Endpoint Setup", () => {
  describe("Basic Endpoint Setup", async () => {
    const zeroKnowledgeHandler = new ZeroKnowledgeHandler({
      logLevel: "INFO",
      zkcircuitPath: path.join(__dirname, "../../zokrates"),
    } as ZeroKnowledgeHandlerOptions);
    expect(zeroKnowledgeHandler).toBeDefined();
    await zeroKnowledgeHandler.initializeZoKrates();
    let basicEndpoint: Endpoint;
    it("should successfully setup a Basic Endpoint for ZK circuit compilation", async () => {
      basicEndpoint = new Endpoint(zeroKnowledgeHandler);
      expect(basicEndpoint).toBeDefined();
      basicEndpoint.setupEndpoint({
        endpointService: {
          endpointName: "compileCircuit",
          executeFunction: "compileCircuit",
          endpointCallType: EndpointCallType.POST,
        },
      });
    });

    it("should successfully perform a compile circuit call", async () => {
      const response = await basicEndpoint.executeService("compileCircuit", [
        {
          circuitName: "proveSquare.zok",
        } as CircuitLoadSetup,
      ]);
      expect(response).toBeDefined();
    });
  });

  describe("Endpoint Setup Errors", async () => {
    let basicEndpoint: Endpoint;
    const zeroKnowledgeHandler = new ZeroKnowledgeHandler({
      logLevel: "INFO",
      zkcircuitPath: path.join(__dirname, "../../zokrates"),
    } as ZeroKnowledgeHandlerOptions);
    expect(zeroKnowledgeHandler).toBeDefined();
    await zeroKnowledgeHandler.initializeZoKrates();

    it("should initialize two endpoints, and avoid endpoint overwrite", async () => {
      basicEndpoint = new Endpoint(zeroKnowledgeHandler);
      expect(basicEndpoint).toBeDefined();
      basicEndpoint.setupEndpoint({
        endpointService: {
          endpointName: "computeWitness",
          executeFunction: "computeWitness",
          endpointCallType: EndpointCallType.POST,
        },
        blackListedServices: ["compileCircuit"],
      });

      expect(() => {
        basicEndpoint.setupEndpoint({
          endpointService: {
            endpointName: "compileCircuit",
            executeFunction: "compileCircuit",
            endpointCallType: EndpointCallType.POST,
          },
        });
      }).toThrow(OverwriteServiceError);
    });

    it("should avoid blacklisted service call", async () => {
      expect(() => {
        basicEndpoint.executeService("compileCircuit", [
          {
            circuitName: "proveSquare.zok",
          } as CircuitLoadSetup,
        ]);
      }).toThrow(BlacklistedServiceError);
    });
  });
});
