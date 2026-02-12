import { LogLevelDesc } from "@hyperledger/cactus-common";
import { Logger } from "@hyperledger/cactus-common";
import { LoggerProvider } from "@hyperledger/cactus-common";
import path from "path";
import fs from "fs";
import {
  ZoKratesProvider,
  Backend,
  Curve,
  Scheme,
  CompilationArtifacts,
  ComputationResult,
  Proof,
  initialize,
  ProvingKey,
  VerificationKey,
} from "zokrates-js";
import {
  ZoKratesComputationError,
  ZoKratesInitializationError,
  ZoKratesProviderNotInitializedError,
} from "./errors/zk-errors.js";

export interface ZeroKnowledgeProviderOptions {
  // Library to use when computing zk steps
  backend: Backend;
  // Elliptic curve to use for zk operations
  curve: Curve;
  // Proof scheme to use
  scheme: Scheme;
}

export interface CircuitSetup {}
export interface CircuitLoadSetup extends CircuitSetup {
  circuitName: string;
  circuitPath?: string;
}
export interface RawCircuitSetup extends CircuitSetup {
  circuitSource: string;
}

export interface ZeroKnowledgeHandlerOptions {
  logLevel: LogLevelDesc;
  zkcircuitPath: string;
  providerOptions?: ZeroKnowledgeProviderOptions;
}

export class ZeroKnowledgeHandler {
  public static readonly CLASS_NAME = "ZeroKnowledgeHandler";
  private readonly log: Logger;
  private readonly logLevel: LogLevelDesc;
  private provider: ZoKratesProvider | undefined;
  private defaultCircuitPath: string | undefined;
  private compilationResult: CompilationArtifacts | undefined;
  private witnessResult: ComputationResult | undefined;
  private provingKey: ProvingKey | undefined;

  constructor(options: ZeroKnowledgeHandlerOptions) {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#constructor()`;
    const label = ZeroKnowledgeHandler.CLASS_NAME;
    this.logLevel = options.logLevel || "INFO";
    this.log = LoggerProvider.getOrCreate({ label, level: this.logLevel });
    this.defaultCircuitPath = options.zkcircuitPath;
    try {
      this.initializeZoKrates(options.providerOptions);
    } catch (error) {
      this.log.error(
        `${fnTag}: Error during ZoKrates initialization: ${error}`,
      );
      throw new ZoKratesInitializationError(error.message);
    }
  }

  public async initializeZoKrates(
    options?: ZeroKnowledgeProviderOptions,
  ): Promise<void> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#initializeZoKrates()`;
    this.log.debug(`${fnTag}: Initializing a new ZoKrates Handler...`);
    try {
      if (options == undefined) {
        this.provider = await initialize();
      } else {
        initialize().then((defaultProvider) => {
          this.provider = defaultProvider.withOptions({
            backend: options.backend,
            curve: options.curve,
            scheme: options.scheme,
          });
        });
      }
      this.log.info(`${fnTag}: ZoKrates Handler initialized successfully.`);
    } catch (error) {
      this.log.error(`${fnTag}: Error initializing ZoKrates: ${error}`);
      throw new ZoKratesInitializationError(error.message);
    }
  }

  public async compileCircuit(
    circuitSetup: CircuitSetup,
  ): Promise<VerificationKey> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#compileCircuit()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (
        "circuitName" in circuitSetup &&
        typeof circuitSetup.circuitName === "string"
      ) {
        let circuitPath;
        const circuitLoadSetup = circuitSetup as CircuitLoadSetup;
        if (circuitLoadSetup.circuitPath != undefined) {
          circuitPath = path.resolve(
            circuitLoadSetup.circuitPath,
            circuitLoadSetup.circuitName,
          );
        } else if (this.defaultCircuitPath != undefined) {
          circuitPath = path.resolve(
            this.defaultCircuitPath,
            circuitLoadSetup.circuitName,
          );
        } else {
          throw new ZoKratesComputationError(
            "No valid circuit path provided or set as default",
            fnTag,
          );
        }
        const source = fs.readFileSync(circuitPath).toString();
        const options = {
          location: circuitPath, // location of the root module
          resolveCallback: (currentLocation, importLocation) => {
            const dir = path.dirname(currentLocation);
            const importPath = path.resolve(dir, importLocation);
            if (!fs.existsSync(importPath)) {
              this.log.error(`[resolveCallback] File not found: ${importPath}`);
              throw new Error(
                `ZoKrates import error: File not found: ${importPath}`,
              );
            }
            const importSource = fs.readFileSync(importPath, "utf8");
            return {
              source: importSource,
              location: importPath,
            };
          },
        };
        this.compilationResult = await this.provider.compile(source, options);
      } else if (
        "circuitSource" in circuitSetup &&
        typeof circuitSetup.circuitSource === "string"
      ) {
        const rawCircuitSetup = circuitSetup as RawCircuitSetup;
        this.compilationResult = await this.provider.compile(
          rawCircuitSetup.circuitSource,
        );
      } else {
        throw new ZoKratesComputationError(
          "Invalid circuit setup provided",
          fnTag,
        );
      }
      const vk = await this.generateProofKeyPair();
      return vk;
    } catch (error) {
      this.log.error(`${fnTag}: Error during circuit compilation: ${error}`);
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async computeWitness(inputs: any[]): Promise<string> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#computeWitness()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (this.compilationResult != undefined) {
        this.witnessResult = await this.provider.computeWitness(
          this.compilationResult,
          inputs,
        );
        if (this.witnessResult != undefined) {
          return "OK";
        } else {
          return "NOK";
        }
      } else {
        throw new ZoKratesComputationError(
          "No compilation result available. Please compile a circuit before computing the witness.",
          fnTag,
        );
      }
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  private async generateProofKeyPair(): Promise<VerificationKey> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#generateProofKeyPair()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (this.compilationResult != undefined) {
        const keypair = await this.provider.setup(
          this.compilationResult.program,
        );
        this.provingKey = keypair.pk;
        return keypair.vk;
      } else {
        throw new ZoKratesComputationError(
          "No compilation result available. Please compile a circuit before generating the proof key pair.",
          fnTag,
        );
      }
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async generateProof(): Promise<Proof> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#generateProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (
        this.compilationResult != undefined &&
        this.witnessResult != undefined &&
        this.provingKey != undefined
      ) {
        return this.provider.generateProof(
          this.compilationResult.program,
          this.witnessResult.witness,
          this.provingKey,
        );
      } else {
        throw new ZoKratesComputationError(
          "Missing compilation, witness or proving key. Ensure all steps are completed beforehand.",
          fnTag,
        );
      }
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async verifyProof(
    proof: Proof,
    vk: VerificationKey,
  ): Promise<boolean> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#verifyProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      return this.provider.verify(vk, proof);
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }
}
