import { LogLevelDesc } from "@hyperledger/cactus-common";
import { Logger } from "@hyperledger/cactus-common";
import { LoggerProvider } from "@hyperledger/cactus-common";
import path, { dirname } from "path";
//import fs from "fs";
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
import { createHash } from "crypto";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";

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
  chainIp?: string;
  connectionType?: string;
}

export enum chainActions {
  lock = "LOCK",
  mint = "MINT",
  burn = "BURN",
  release = "ASSIGN",
  common = "COMMON",
}

export class ZeroKnowledgeHandlerV2 {
  public static readonly CLASS_NAME = "ZeroKnowledgeHandler";
  private readonly log: Logger;
  private readonly logLevel: LogLevelDesc;
  private provider: ZoKratesProvider | undefined;
  private defaultCircuitPath: string | undefined;
  private proofsList = new Map<string, Proof>();
  private compilationsList = new Map<string, CompilationArtifacts>();
  private provingKeysList = new Map<string, ProvingKey>();
  private circuitVersionList = new Map<string, number>();
  private defaultChainProtocol: string;
  private defaultChainIp: string;
  private defaultChainPort: string;

  constructor(options: ZeroKnowledgeHandlerOptions) {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#constructor()`;
    const label = ZeroKnowledgeHandlerV2.CLASS_NAME;
    this.logLevel = options.logLevel || "INFO";
    this.log = LoggerProvider.getOrCreate({ label, level: this.logLevel });
    this.defaultCircuitPath = options.zkcircuitPath;
    try {
      this.initializeZoKrates(options.providerOptions);
      this.defaultChainProtocol = options.connectionType ?? "http";
      this.defaultChainIp = options.chainIp ?? "localhost";
      this.defaultChainPort = options.chainPort ?? "8545";
      this.circuitVersionList.set(chainActions.lock, 0);
      this.circuitVersionList.set(chainActions.mint, 0);
      this.circuitVersionList.set(chainActions.burn, 0);
      this.circuitVersionList.set(chainActions.release, 0);
      this.circuitVersionList.set(chainActions.common, 0);
    } catch (error) {
      this.log.error(
        `${fnTag}: Error during ZoKrates initialization: ${error}`,
      );
      throw new ZoKratesInitializationError(error.message);
    }
  }

  public checkCurrentCircuitVersion(chainAction?: string) {
    const chainActionId = chainAction?.toUpperCase() ?? chainActions.common;
    return this.circuitVersionList.get(chainActionId);
  }

  public getConnector(
    ext: string,
    ip: string,
    port: string,
  ): EVMConnectorSimple {
    return new EVMConnectorSimple(port, ip, ext);
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
    chainAction?: string,
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

      /*const source = fs.readFileSync(circuitPath).toString();
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
      console.log("Starting Complation ", Date.now());
      const circuitCompilation = await this.provider.compile(source, options);
      console.log("Finished Compilation ", Date.now());
      console.log("KeyPair start ", Date.now());
      const keyPair = await this.generateProofKeyPair(circuitCompilation);
      console.log("Keypair finished ", Date.now());*/
      const __filename = fileURLToPath(import.meta.url);
      const __dirname2 = dirname(__filename);
      console.log("Server handler running ON ", __dirname2);
      const compArtifacts = await new Promise<{
        compilation: CompilationArtifacts;
        keypair: SetupKeypair;
      }>((resolve, reject) => {
        const worker = new Worker(
          path.resolve(__dirname2, "../build/compileWorker/index.js"),
          {
            workerData: { circuitPath: circuitPath },
          },
        );
        worker.on("message", (result) =>
          resolve(
            result as {
              compilation: CompilationArtifacts;
              keypair: SetupKeypair;
            },
          ),
        );
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0)
            reject(new Error(`Worker stopped with exit code ${code}`));
        });
      });
      const circuitCompilation = compArtifacts.compilation;
      const keyPair = compArtifacts.keypair;

      //update version o circuit
      const chainActionId = chainAction?.toUpperCase() ?? chainActions.common;
      const circuitVersion = this.circuitVersionList.get(chainActionId)! + 1;
      this.circuitVersionList.set(chainActionId, circuitVersion);
      const circuitArtifactsId =
        chainActionId + ":" + circuitVersion.toString();

      //store proving key and compilation
      this.provingKeysList.set(circuitArtifactsId, keyPair.pk);
      this.compilationsList.set(circuitArtifactsId, circuitCompilation);

      return { vk: keyPair.vk, version: circuitVersion.toString() };
    } catch (error) {
      this.log.error(`${fnTag}: Error during circuit compilation: ${error}`);
      throw new ZoKratesComputationError(error.message, fnTag);
    }
  }

  private async computeWitness(
    inputs: any[],
    chainAction?: string,
  ): Promise<ComputationResult> {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#computeWitness()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      const chainActionId = chainAction?.toUpperCase() ?? chainActions.common;
      const circuitArtifactsId =
        chainActionId +
        ":" +
        this.circuitVersionList.get(chainActionId)!.toString();
      const circuitCompilation = this.compilationsList.get(circuitArtifactsId);
      if (circuitCompilation) {
        /*const witness = await this.provider.computeWitness(
          circuitCompilation,
          inputs,
        );*/
        const witness = await new Promise<ComputationResult>(
          (resolve, reject) => {
            const worker = new Worker(
              path.resolve(__dirname, "witnessWorker.js"),
              {
                workerData: { compilation: circuitCompilation, inputs: inputs },
              },
            );
            worker.on("message", (result) =>
              resolve(result as ComputationResult),
            );
            worker.on("error", reject);
            worker.on("exit", (code) => {
              if (code !== 0)
                reject(new Error(`Worker stopped with exit code ${code}`));
            });
          },
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

  public async generateProof(
    inputs: any[],
    sessionId: string,
    chainAction?: string,
  ): Promise<Proof> {
    const fntag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#generateProof()`;
    if (this.provider == undefined) {
      throw new ZoKratesProviderNotInitializedError();
    }
    try {
      console.log(
        "\n\nFor sessionID ",
        sessionId,
        " Witness start at ",
        Date.now(),
      );
      console.log(inputs);
      const witness = await this.computeWitness(inputs);
      console.log(
        "\n\nFor sessionID ",
        sessionId,
        "Witness end at ",
        Date.now(),
      );
      const chainActionId = chainAction?.toUpperCase() ?? chainActions.common;
      const circuitArtifactsId =
        chainActionId +
        ":" +
        this.circuitVersionList.get(chainActionId)!.toString();
      const circuitCompilation = this.compilationsList.get(circuitArtifactsId);
      const provingKey = this.provingKeysList.get(circuitArtifactsId);
      if (circuitCompilation && provingKey) {
        console.log(
          "\n\nFor sessionID ",
          sessionId,
          " Proof start at ",
          Date.now(),
        );
        const p = await this.provider.generateProof(
          circuitCompilation.program,
          witness.witness,
          provingKey,
        );
        console.log(
          "\n\nFor sessionID ",
          sessionId,
          " Proof end at ",
          Date.now(),
        );
        this.proofsList.set(`${sessionId}:${chainAction}`, p);
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

  public async generateChainProof(
    txHash: string,
    sessionId: string,
    ext?: string,
    ip?: string,
    port?: string,
  ) {
    const requestReceivalTimestamp = Math.floor(Date.now() / 1000);
    let connector;
    console.log(
      "Request received for proof generation at: ",
      requestReceivalTimestamp,
    );
    if (ext && ip && port) {
      connector = this.getConnector(ext, ip, port);
    } else {
      connector = this.getConnector(
        this.defaultChainProtocol,
        this.defaultChainIp,
        this.defaultChainPort,
      );
    }
    const txReceipt = await connector.fetchTransactionReceipt(txHash);
    const block = await connector.fetchBlock(txReceipt.blockNumber);
    /*const rawTx = await this.simplifiedConnector.fetchTransactionFromBlock(
      block,
      txHash,
    );*/
    const txFrom = txReceipt.from.slice(-40).padStart(48, "0");
    const blockParent = block.parentHash; //length of 64
    const fullProofDataSet = txFrom + blockParent;
    const dataSetHash = createHash("sha256")
      .update(fullProofDataSet)
      .digest("hex");
    const proofInput1 = this.hexToU16Array(txFrom);
    const proofInput2 = this.hexToU16Array(blockParent);
    console.log(proofInput1);
    console.log(proofInput2);
    const hashInput = this.hexToU32Array(dataSetHash);
    console.log(hashInput);
    console.log(dataSetHash);

    const proof = this.generateProof(
      [proofInput1, proofInput2, hashInput],
      sessionId,
    );
    return proof;
  }

  public async generateSignatureProof(
    txHash: string,
    sessionId: string,
    signature: string,
    ext?: string,
    ip?: string,
    port?: string,
  ) {
    const requestReceivalTimestamp = (Math.floor(Date.now() / 1000) % 1000)
      .toString()
      .padStart(3, "0");

    let connector;
    if (ext && ip && port) {
      connector = this.getConnector(ext, ip, port);
    } else {
      connector = this.getConnector(
        this.defaultChainProtocol,
        this.defaultChainIp,
        this.defaultChainPort,
      );
    }
    const txReceipt = await connector.fetchTransactionReceipt(txHash);
    const block = await connector.fetchBlock(txReceipt.blockNumber);

    const txBlockNumber = txReceipt.blockNumber.toString(16).padStart(3, "0");
    const txBlockTime = (block.timestamp % 1000).toString().padStart(3, "0");
    const txStatus = txReceipt.status.toString(16);
    const txAmount = parseInt(txReceipt.logs[0].data, 16)
      .toString(16)
      .padStart(3, "0");

    const txWrapperAddress = txReceipt.to.slice(-40).toLowerCase();
    const txGatewayReqAddress = txReceipt.from.slice(-40).toLowerCase();
    const txSessionId = sessionId.padStart(55, "0");

    const publicHash = createHash("sha256")
      .update(txSessionId + txWrapperAddress + txGatewayReqAddress + txHash)
      .digest("hex");

    const u8SessionId = this.stringToU8Array(txSessionId);
    const u8BlockTimestamp = this.stringToU8Array(txBlockTime);
    const u8RequestTimestamp = this.stringToU8Array(requestReceivalTimestamp);
    const u8TxStatus = this.stringToU8Array(txStatus);
    const u8TxBlockNumber = this.stringToU8Array(txBlockNumber);
    const u8TxAmount = this.stringToU8Array(txAmount);
    const u32Hash = this.hexToU32Array(publicHash);

    const privateHash = createHash("sha256")
      .update(txAmount + txBlockNumber + "1" + txStatus)
      .digest("hex");

    const eddsa_signature = JSON.parse(signature);
    console.log(`\nSIGNED MSG ${publicHash}${privateHash}`);
    console.log("\n\nRECEIVE SIGNATURE ", eddsa_signature);
    console.log("Block timestamp is ", txBlockTime);
    console.log("Request timestamp is ", requestReceivalTimestamp);

    const proof = await this.generateProof(
      [
        u8SessionId,
        u32Hash,
        u8BlockTimestamp,
        u8RequestTimestamp,
        u8TxStatus[0],
        u8TxBlockNumber,
        u8TxAmount,
        eddsa_signature.R,
        eddsa_signature.S,
        eddsa_signature.A,
      ],
      sessionId,
    );
    return proof;
  }

  private hexToU16Array(str: string): string[] {
    const bytes = Array.from(str).map((c) => c.charCodeAt(0));
    const arr: string[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
      let a;
      if (i + 1 >= bytes.length) {
        a = 0;
      } else {
        a = bytes[i + 1];
      }
      const rep = bytes[i] * 256 + a;
      arr.push(rep.toString());
    }
    return arr;
  }
  private hexToU32Array(hex: string): string[] {
    if (hex.startsWith("0x") || hex.startsWith("0X")) {
      hex = hex.slice(2);
    }
    const arr: string[] = [];
    for (let i = 0; i < hex.length; i += 8) {
      // Take 8 hex chars (32 bits)
      const chunk = hex.slice(i, i + 8);
      arr.push(parseInt(chunk, 16).toString());
    }
    return arr;
  }
  private stringToU8Array(str: string): string[] {
    return Array.from(str).map((c) => c.charCodeAt(0).toString());
  }
}
