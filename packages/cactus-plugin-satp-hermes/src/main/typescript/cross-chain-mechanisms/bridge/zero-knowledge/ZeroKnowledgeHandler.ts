
import { LoggerProvider } from "@hyperledger/cactus-common/";
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
import { zoKratesPadding } from "./zk-utils";

// Instead of: import { initialize } from "zokrates-js";

export interface ZeroKnowledgeProviderOptions {
  backend: Backend;
  curve: Curve;
  scheme: Scheme;
}

export interface ZeroKnowledgeHandlerOptions {
  zkcircuitPath?: string;
  providerOptions?: ZeroKnowledgeProviderOptions;
}

export class ZeroKnowledgeHandler {
  public static readonly CLASS_NAME = "ZeroKnowledgeHandler";
  private readonly log: any;
  public provider: ZoKratesProvider | undefined;
  private zkcircuitPath: string | undefined;

  constructor(options: ZeroKnowledgeHandlerOptions) {
    const label = ZeroKnowledgeHandler.CLASS_NAME;
    this.log = LoggerProvider.getOrCreate({ label, level: "INFO" });
    this.zkcircuitPath = options.zkcircuitPath;
  }

  public async initializeZoKrates(
    options?: ZeroKnowledgeProviderOptions,
  ): Promise<void> {
    const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#initializeZoKrates()`;
    this.log.info(`${fnTag} - Initializing ZoKrates Service Provider...`);
    try {
      if (options == undefined) {
        this.log.info("No options provided for handler, default init");
        this.provider = await initialize();
      } else {
        this.log.info(`Initializing ZoKrates provider with backend: ${options.backend}, curve: ${options.curve}, scheme: ${options.scheme}`);
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

  public async computeZoKratesHash(data: string): Promise<string> {
    const parsedData = zoKratesPadding(data);
    return parsedData;
}
