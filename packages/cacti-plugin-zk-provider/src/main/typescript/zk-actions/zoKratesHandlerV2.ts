import { LogLevelDesc } from "@hyperledger/cactus-common";
import { Logger } from "@hyperledger/cactus-common";
import { LoggerProvider } from "@hyperledger/cactus-common";
import path, { dirname } from "path";
import {
  Backend,
  Curve,
  Scheme,
  CompilationArtifacts,
  SetupKeypair,
  Proof,
  ProvingKey,
  VerificationKey,
} from "zokrates-js";
import {
  ZoKratesComputationError,
  ZoKratesInitializationError,
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

  public async compileCircuit(
    circuitFilename: string,
    chainAction?: string,
  ): Promise<{ vk: VerificationKey; version: string }> {
    const fnTag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#compileCircuit()`;
    try {
      if (!this.defaultCircuitPath) {
        throw new Error("No path provided for zoKrates file search");
      }

      const circuitPath = path.resolve(
        this.defaultCircuitPath,
        circuitFilename,
      );
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const compArtifacts = await new Promise<{
        compilation: CompilationArtifacts;
        keypair: SetupKeypair;
      }>((resolve, reject) => {
        const worker = new Worker(
          path.resolve(__dirname, "../build/compileWorker/index.js"),
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

  public async generateProof(
    inputs: any[],
    sessionId: string,
    chainAction?: string,
  ): Promise<Proof> {
    const fntag = `${ZeroKnowledgeHandlerV2.CLASS_NAME}#generateProof()`;
    try {
      const chainActionId = chainAction?.toUpperCase() ?? chainActions.common;
      const circuitArtifactsId =
        chainActionId +
        ":" +
        this.circuitVersionList.get(chainActionId)!.toString();
      const circuitCompilation = this.compilationsList.get(circuitArtifactsId);
      if (circuitCompilation) {
        const provingKey = this.provingKeysList.get(circuitArtifactsId);
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const zkSnark = await new Promise<Proof>((resolve, reject) => {
          const worker = new Worker(
            path.resolve(__dirname, "../build/proofWorker/index.js"),
            {
              workerData: {
                compilation: circuitCompilation,
                inputs: inputs,
                provingKey: provingKey,
                sessionId: sessionId,
              },
            },
          );
          worker.on("message", (result) => resolve(result as Proof));
          worker.on("error", reject);
          worker.on("exit", (code) => {
            if (code !== 0)
              reject(new Error(`Worker stopped with exit code ${code}`));
          });
        });

        this.proofsList.set(`${sessionId}:${chainAction}`, zkSnark);
        return zkSnark;
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
    try {
      const validity = await new Promise<boolean>((resolve, reject) => {
        const worker = new Worker(
          path.resolve(__dirname, "../build/verifyWorker/index.js"),
          {
            workerData: {
              proof: proof,
              verificationKey: vk,
            },
          },
        );
        worker.on("message", (result) => resolve(result as boolean));
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0)
            reject(new Error(`Worker stopped with exit code ${code}`));
        });
      });
      return validity;
    } catch (error) {
      throw new ZoKratesComputationError(error.message, fntag);
    }
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

    const eddsa_signature = JSON.parse(signature);

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
