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
  SetupKeypair,
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
import { EVMConnectorSimple } from "./EVMConnectorSimple.js";

export interface ZeroKnowledgeProviderOptions {
  // Library to use when computing zk steps
  backend: Backend;
  // Elliptic curve to use for zk operations
  curve: Curve;
  // Proof scheme to use
  scheme: Scheme;
}

export interface ZeroKnowledgeHandlerOptions {
  logLevel: LogLevelDesc;
  zkcircuitPath: string;
  providerOptions?: ZeroKnowledgeProviderOptions;
  chainPort?: string;
}

export class ZeroKnowledgeHandlerV2 {
  public static readonly CLASS_NAME = "ZeroKnowledgeHandler";
  private readonly log: Logger;
  private readonly logLevel: LogLevelDesc;
  private provider: ZoKratesProvider | undefined;
  private defaultCircuitPath: string | undefined;
  private simplifiedConnector: EVMConnectorSimple;
  private circuitCompilation: CompilationArtifacts | undefined;
  private provingKey: ProvingKey | undefined;
  private CircuitVersion = 0;

  constructor(options: ZeroKnowledgeHandlerOptions) {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#constructor()`;
    const label = ZeroKnowledgeHandlerV2.CLASS_NAME;
    this.logLevel = options.logLevel || "INFO";
    this.log = LoggerProvider.getOrCreate({ label, level: this.logLevel });
    this.defaultCircuitPath = options.zkcircuitPath;
    try {
      this.initializeZoKrates(options.providerOptions);
      this.simplifiedConnector = new EVMConnectorSimple(
        options.chainPort ?? "8545",
      );
    } catch (error) {
      this.log.error(
        `${fnTag}: Error during ZoKrates initialization: ${error}`,
      );
      throw new ZoKratesInitializationError(error.message);
    }
  }

  public checkCurrentCircuitVersion() {
    return this.CircuitVersion;
  }

  public async initializeZoKrates(
    options?: ZeroKnowledgeProviderOptions,
  ): Promise<void> {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#initializeZoKrates()`;
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
    circuitFilename: string,
  ): Promise<{ vk: VerificationKey; version: string }> {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#compileCircuit()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (!this.defaultCircuitPath) {
        throw new Error("No path provided for zoKrates file search");
      }

      const circuitPath = path.resolve(
        this.defaultCircuitPath,
        circuitFilename,
      );

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
      this.circuitCompilation = await this.provider.compile(source, options);
      const keyPair = await this.generateProofKeyPair(this.circuitCompilation);
      this.provingKey = keyPair.pk;
      this.CircuitVersion += 1;
      return { vk: keyPair.vk, version: this.CircuitVersion.toString() };
    } catch (error) {
      this.log.error(`${fnTag}: Error during circuit compilation: ${error}`);
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  private async computeWitness(inputs: string[]): Promise<ComputationResult> {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#computeWitness()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (this.circuitCompilation) {
        const witness = this.provider.computeWitness(
          this.circuitCompilation,
          inputs,
        );
        return witness;
      } else {
        throw new Error("No Compilation Provided");
      }
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  private async generateProofKeyPair(
    compiledArtifacts: CompilationArtifacts,
  ): Promise<SetupKeypair> {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#generateProofKeyPair()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      return this.provider.setup(compiledArtifacts.program);
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async generateProof(inputs: string[]): Promise<Proof> {
    const fntag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#generateProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      const witness = await this.computeWitness(inputs);
      if (this.circuitCompilation && this.provingKey) {
        const p = await this.provider.generateProof(
          this.circuitCompilation.program,
          witness.witness,
          this.provingKey,
        );
        return p;
      } else {
        throw new Error("No Compilation and Proving Key Provided");
      }
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fntag);
    }
  }

  public async verifyProof(
    proof: Proof,
    vk: VerificationKey,
  ): Promise<boolean> {
    const fntag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#verifyProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      return this.provider.verify(vk, proof);
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fntag);
    }
  }
}
