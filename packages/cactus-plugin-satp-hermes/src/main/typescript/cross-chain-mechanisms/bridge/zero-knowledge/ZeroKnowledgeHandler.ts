import { Logger, LoggerProvider } from "@hyperledger/cactus-common/";
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

  constructor(options: ZeroKnowledgeHandlerOptions, log?: Logger) {
    if (log == undefined) {
      const label = ZeroKnowledgeHandler.CLASS_NAME;
      this.log = LoggerProvider.getOrCreate({ label, level: "INFO" });
    } else {
      this.log = log;
    }

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
        this.log.info(
          `Initializing ZoKrates provider with backend: ${options.backend}, curve: ${options.curve}, scheme: ${options.scheme}`,
        );
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
    //const fnTag = `${ZeroKnowledgeHandler.CLASS_NAME}#compileCircuit()`;
    try {
      if (this.provider != undefined) {
        return this.provider.compile(source);
      }
      throw new Error("ZoKrates provider not initialized");
    } catch (error) {
      this.log.info(error);
      throw error;
    }
  }

  public async computeWitness(
    CompilationArtifacts: CompilationArtifacts,
    inputs: string[],
  ): Promise<ComputationResult> {
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */ /* tslint:disable-next-line:no-unused-variable */ // @ts-ignore
    //const paddedInputs = await zoKratesPadding(inputs, this.log);
    try {
      if (this.provider != undefined) {
        return this.provider.computeWitness(CompilationArtifacts, inputs);
      }
      throw new Error("ZoKrates provider not initialized");
    } catch (error) {
      throw error;
    }
  }

  public async generateProofKeyPair(
    compiledArtifacts: CompilationArtifacts,
  ): Promise<SetupKeypair> {
    try {
      if (this.provider != undefined) {
        return this.provider.setup(compiledArtifacts.program);
      }
      throw new Error("ZoKrates provider not initialized");
    } catch (error) {
      throw error;
    }
  }

  public async generateProof(
    compiledArtifacts: CompilationArtifacts,
    witness: ComputationResult,
    keypair: SetupKeypair,
  ): Promise<Proof> {
    try {
      if (this.provider != undefined) {
        return this.provider.generateProof(
          compiledArtifacts.program,
          witness.witness,
          keypair.pk,
        );
      }
      throw new Error("ZoKrates provider not initialized");
    } catch (error) {
      throw error;
    }
  }

  public async generateProofSmartContract(
    keyPair: SetupKeypair,
  ): Promise<string> {
    try {
      if (this.provider != undefined) {
        return this.provider.exportSolidityVerifier(keyPair.vk);
      }
      throw new Error("ZoKrates provider not initialized");
    } catch (error) {
      throw error;
    }
  }

  public async verifyProof(
    proof: Proof,
    keypair: SetupKeypair,
  ): Promise<boolean> {
    try {
      if (this.provider != undefined) {
        return this.provider.verify(keypair.vk, proof);
      }
      throw new Error("ZoKrates provider not initialized");
    } catch (error) {
      throw error;
    }
  }
}
