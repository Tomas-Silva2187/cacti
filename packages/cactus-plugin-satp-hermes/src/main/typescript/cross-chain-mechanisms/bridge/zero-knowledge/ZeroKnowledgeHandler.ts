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
} from "zokrates-js";

// Instead of: import { initialize } from "zokrates-js";

export interface ZeroKnowledgeProviderOptions {
  backend: Backend;
  curve: Curve;
  scheme: Scheme;
}

export interface ZeroKnowledgeHandlerOptions {
  logLevel?: LogLevelDesc;
  zkcircuitPath?: string;
  providerOptions?: ZeroKnowledgeProviderOptions;
}

export class ZeroKnowledgeHandler {
  public static readonly CLASS_NAME = "ZeroKnowledgeHandler";
  private readonly log: Logger;
  private readonly logLevel: LogLevelDesc;
  private provider: ZoKratesProvider | undefined;
  private zkcircuitPath: string | undefined;

  constructor(options: ZeroKnowledgeHandlerOptions) {
    //const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#constructor()`;
    const label = ZeroKnowledgeHandler.CLASS_NAME;
    this.logLevel = options.logLevel || "INFO";
    this.log = LoggerProvider.getOrCreate({ label, level: this.logLevel });
    this.initializeZoKrates(options.providerOptions);
    this.zkcircuitPath = options.zkcircuitPath;
  }

  public async initializeZoKrates(
    options?: ZeroKnowledgeProviderOptions,
  ): Promise<void> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#initializeZoKrates()`;
    this.log.debug(`${fnTag} - Initializing ZoKrates...`);
    try {
      const { initialize } = await import("zokrates-js");
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
      this.log.info(`${fnTag} - ZoKrates initialized successfully.`);
    } catch (error) {
      this.log.error(`${fnTag} - Error initializing ZoKrates: ${error}`);
      throw error;
    }
  }

  public async compileCircuit(
    circuitName: string,
    circuitPath?: string,
  ): Promise<CompilationArtifacts> {
    const resolvedCircuitPath = path.resolve(
      this.zkcircuitPath || circuitPath || "",
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
