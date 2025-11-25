import { LogLevelDesc } from "@hyperledger/cactus-common/dist/lib/main/typescript/log-level";
import { Logger } from "@hyperledger/cactus-common/dist/lib/main/typescript/logging/logger";
import { LoggerProvider } from "@hyperledger/cactus-common/dist/lib/main/typescript/logging/logger-provider";
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
import { ZoKratesInitializationError } from "./errors/zk-errors";

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
    circuitName: string,
    circuitPath?: string,
  ): Promise<CompilationArtifacts> {
    const resolvedCircuitPath = path.resolve(
      this.defaultCircuitPath || circuitPath || "",
      circuitName,
    );
    const source = fs.readFileSync(resolvedCircuitPath).toString();
    return this.provider!.compile(source);
  }

  public async computeWitness(
    CompilationArtifacts: CompilationArtifacts,
    inputs: string[],
  ): Promise<ComputationResult> {
    return this.provider!.computeWitness(CompilationArtifacts, inputs);
  }

  public async generateProofKeyPair(
    compiledArtifacts: CompilationArtifacts,
  ): Promise<SetupKeypair> {
    return this.provider!.setup(compiledArtifacts.program);
  }

  public async generateProof(
    compiledArtifacts: CompilationArtifacts,
    witness: ComputationResult,
    keypair: SetupKeypair,
  ): Promise<Proof> {
    return this.provider!.generateProof(
      compiledArtifacts.program,
      witness.witness,
      keypair.pk,
    );
  }

  public async verifyProof(
    proof: Proof,
    keypair: SetupKeypair,
  ): Promise<boolean> {
    return this.provider!.verify(keypair.vk, proof);
  }
}
