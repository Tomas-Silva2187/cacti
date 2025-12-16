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
} from "zokrates-js";
import {
  ZoKratesComputationError,
  ZoKratesInitializationError,
  ZoKratesProviderNotInitializedError,
} from "./errors/zk-errors";

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
  ): Promise<CompilationArtifacts> {
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
        return this.provider.compile(source);
      } else if (
        "circuitSource" in circuitSetup &&
        typeof circuitSetup.circuitSource === "string"
      ) {
        const rawCircuitSetup = circuitSetup as RawCircuitSetup;
        return this.provider.compile(rawCircuitSetup.circuitSource);
      } else {
        throw new ZoKratesComputationError(
          "Invalid circuit setup provided",
          fnTag,
        );
      }
    } catch (error) {
      this.log.error(`${fnTag}: Error during circuit compilation: ${error}`);
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async safeComputeWitness(
    CompilationArtifacts: CompilationArtifacts,
    inputs: string[],
  ): Promise<ComputationResult> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#computeWitness()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      if (
        CompilationArtifacts &&
        typeof CompilationArtifacts.program === "object" &&
        !(CompilationArtifacts.program instanceof Uint8Array)
      ) {
        CompilationArtifacts.program = this.uint8ArrayConverter(
          CompilationArtifacts.program,
        );
      }
      return this.provider.computeWitness(CompilationArtifacts, inputs);
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async generateProofKeyPair(
    compiledArtifacts: CompilationArtifacts,
  ): Promise<SetupKeypair> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#generateProofKeyPair()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      return this.provider.setup(compiledArtifacts.program);
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  public async generateProof(
    compiledArtifacts: CompilationArtifacts,
    witness: ComputationResult,
    keypair: SetupKeypair,
  ): Promise<Proof> {
    const fntag = `${ZeroKnowledgeHandler.CLASS_NAME}#generateProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      return this.provider.generateProof(
        compiledArtifacts.program,
        witness.witness,
        keypair.pk,
      );
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fntag);
    }
  }

  public async verifyProof(
    proof: Proof,
    keypair: SetupKeypair,
  ): Promise<boolean> {
    const fntag = `${ZeroKnowledgeHandler.CLASS_NAME}#verifyProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      return this.provider.verify(keypair.vk, proof);
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fntag);
    }
  }

  private uint8ArrayConverter(programObj: any) {
    const programArr = Object.keys(programObj)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => programObj[k]);
    return new Uint8Array(programArr);
  }
}
