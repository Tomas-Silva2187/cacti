import { ZeroKnowledgeHandler } from "../../../../main/typescript/cross-chain-mechanisms/bridge/zero-knowledge/ZeroKnowledgeHandler";
//import * as fs from "fs";
import * as path from "path";
import { describe, expect, it, beforeAll } from "vitest";
import {
  CompilationArtifacts,
  ComputationResult,
  Proof,
  SetupKeypair,
} from "zokrates-js";
import { EthereumTestEnvironment } from "../../test-utils";
import { SupportedContractTypes as SupportedEthereumContractTypes } from "../../environments/ethereum-test-environment";
import {
  ClaimFormat,
  TokenType,
} from "../../../../main/typescript/generated/proto/cacti/satp/v02/common/message_pb";
import { LoggerProvider, LogLevelDesc } from "@hyperledger/cactus-common/";
import solc from "solc";
import { OntologyManager } from "../../../../main/typescript/cross-chain-mechanisms/bridge/ontology/ontology-manager";
import { MonitorService } from "../../../../main/typescript/services/monitoring/monitor";
import { EthereumLeaf } from "../../../../main/typescript/cross-chain-mechanisms/bridge/leafs/ethereum-leaf";

const TIMEOUT = 900000; // 15 minutes
describe("ZeroKnowledgeHandler basics", () => {
  const zkcircuitPath = path.join(__dirname, "../../../zkcircuits");
  let handler: ZeroKnowledgeHandler;
  let compiledCircuit: any;
  let witness: any;
  let keypair: any;
  describe("Single handler testing", () => {
    it("should initialize with default options", async () => {
      handler = new ZeroKnowledgeHandler({
        zkcircuitPath,
      });
      expect(handler).toBeDefined();
      await handler.initializeZoKrates();
    });

    it("should compile the zk circuit and generate cryptographic artifacts for it", async () => {
      compiledCircuit = await handler.compileCircuit("c1.zok");
      expect(compiledCircuit).toBeDefined();
      witness = await handler.computeWitness(compiledCircuit, ["2", "4"]);
      expect(witness).toBeDefined();
      keypair = await handler.generateProofKeyPair(compiledCircuit);
      expect(keypair).toBeDefined();
    });

    it("should generate a proof and successfully verify it", async () => {
      const proof = await handler.generateProof(
        compiledCircuit,
        witness,
        keypair,
      );
      expect(proof).toBeDefined();
      const isValid = await handler.verifyProof(proof, keypair);
      expect(isValid).toBe(true);
    });
  });

  describe("Multiple handler testing", () => {
    let handler1: ZeroKnowledgeHandler;
    let handler2: ZeroKnowledgeHandler;
    let compiledCircuit: any;
    let witness1: any;
    let keypair1: any;
    let keypair2: any;

    it("should initialize two handlers with default options", async () => {
      handler1 = new ZeroKnowledgeHandler({
        zkcircuitPath,
      });
      handler2 = new ZeroKnowledgeHandler({
        zkcircuitPath,
      });

      await handler1.initializeZoKrates();
      await handler2.initializeZoKrates();
      compiledCircuit = await handler1.compileCircuit("c1.zok");
    });

    it("Handler should generate a valid proof and artifacts for another handler", async () => {
      witness1 = await handler1.computeWitness(compiledCircuit, ["2", "4"]);
      keypair1 = await handler1.generateProofKeyPair(compiledCircuit);
      const proof = await handler1.generateProof(
        compiledCircuit,
        witness1,
        keypair1,
      );
      const isValid = await handler2.verifyProof(proof, keypair1);
      expect(isValid).toBe(true);
    });

    it("should fail when artifacts do not match with their respective proof", async () => {
      keypair2 = await handler2.generateProofKeyPair(compiledCircuit);
      const proof = await handler1.generateProof(
        compiledCircuit,
        witness1,
        keypair1,
      );
      const isValid = await handler2.verifyProof(proof, keypair2);
      expect(isValid).toBe(false);
    });
  });
});

describe(
  "ZeroKnowledgeHandler Proof Generation and Verification",
  async () => {
    const zkcircuitPath = path.join(__dirname, "../../../zkcircuits");
    let handler: ZeroKnowledgeHandler;
    let compiledCircuit: CompilationArtifacts;
    let witness: ComputationResult;
    let keypair: SetupKeypair;
    let proof: Proof;
    let ethereumEnv: EthereumTestEnvironment;
    let ethereumLeaf: EthereumLeaf;
    let verificationSmartContract: string;
    let rawContract: any;
    let ontologyManager: OntologyManager;
    let monitorService: MonitorService;
    const logLevel: LogLevelDesc = "DEBUG";
    const log = LoggerProvider.getOrCreate({
      level: logLevel,
      label: "SATP - Hermes",
    });
    describe(
      "Generate and Deploy Proof On-Chain",
      async () => {
        beforeAll(async () => {
          handler = new ZeroKnowledgeHandler(
            {
              zkcircuitPath,
            },
            log,
          );
          expect(handler).toBeDefined();
          await handler.initializeZoKrates();
          log.info("Zero Knowledge Handler initialized successfully");
          {
            const erc20TokenContract = "SATPContract";
            const erc721TokenContract = "SATPNonFungibleContract";
            ethereumEnv = await EthereumTestEnvironment.setupTestEnvironment(
              {
                logLevel,
              },
              [
                {
                  assetType: SupportedEthereumContractTypes.FUNGIBLE,
                  contractName: erc20TokenContract,
                },
                {
                  assetType: SupportedEthereumContractTypes.NONFUNGIBLE,
                  contractName: erc721TokenContract,
                },
              ],
            );
            await ethereumEnv.deployAndSetupContracts(ClaimFormat.BUNGEE);
            log.info("Ethereum Ledger started successfully");

            monitorService = MonitorService.createOrGetMonitorService({
              enabled: false,
            });
            monitorService.init();

            {
              const ontologiesPath = path.join(
                __dirname,
                "../../../ontologies",
              );

              ontologyManager = new OntologyManager(
                {
                  logLevel,
                  ontologiesPath: ontologiesPath,
                },
                monitorService,
              );
            }
          }
        }, TIMEOUT);
        it(
          "should compile and generate the cryptographic elements",
          async () => {
            compiledCircuit = await handler.compileCircuit("c1.zok");
            expect(compiledCircuit).toBeDefined();
            witness = await handler.computeWitness(compiledCircuit, ["2", "4"]);
            expect(witness).toBeDefined();
            keypair = (await handler.generateProofKeyPair(
              compiledCircuit,
            )) as SetupKeypair;
            expect(keypair).toBeDefined();
            verificationSmartContract =
              await handler.generateProofSmartContract(keypair);
            expect(verificationSmartContract).toBeDefined();
            proof = await handler.generateProof(
              compiledCircuit,
              witness,
              keypair,
            );
            expect(proof).toBeDefined();
          },
          TIMEOUT,
        );

        it(
          "should compile the smart contract",
          async () => {
            const contractSetup = {
              language: "Solidity",
              sources: {
                "Verification.sol": {
                  content: verificationSmartContract,
                },
              },
              settings: {
                outputSelection: {
                  "*": {
                    "*": ["*"],
                  },
                },
              },
            };

            rawContract = JSON.parse(
              solc.compile(JSON.stringify(contractSetup)),
            );
            expect(rawContract).toBeDefined();
          },
          TIMEOUT,
        );

        it("should deploy the smart contract on Ethereum", async () => {
          //log.debug(rawContract.contracts["Verification.sol"].Verifier.abi);
          ethereumLeaf = new EthereumLeaf(
            ethereumEnv.createEthereumLeafConfig(ontologyManager, "DEBUG"),
            ontologyManager,
            monitorService,
          );
          expect(ethereumLeaf).toBeDefined();

          await ethereumLeaf.deployZeroKnowledgeVerifierContract(
            "ZKVerification",
            rawContract.contracts["Verification.sol"].Verifier.abi,
            rawContract.contracts["Verification.sol"].Verifier.evm.bytecode
              .object,
          );

          expect(
            ethereumLeaf.getDeployedZeroKnowledgeAddress("ZKVerification"),
          ).toBeDefined();
        });

        it("should verify the proof on-chain", async () => {
          const transactionResponse =
            await ethereumLeaf.verifyZeroKnowledgeProof("ZKVerification", [
              proof.proof,
              proof.inputs,
            ]);
          expect(transactionResponse.transactionReceipt).toBeDefined();
        });
      },
      TIMEOUT,
    );
  },
  TIMEOUT,
);

/*describe("Zero Knowledge Cryptographic Operations", () => {
  const zkcircuitPath = path.join(__dirname, "../../../zkcircuits");
  let handler: ZeroKnowledgeHandler;
  let compiledCircuit: any;
  let witness: any;
  //let keypair: any;
  const log = LoggerProvider.getOrCreate({
    label: ZeroKnowledgeHandler.CLASS_NAME,
    level: "INFO",
  });
  const TIMEOUT = 900000; // 15 minutes
  describe(
    "Zero Knowledge Hash Computations",
    () => {
      it("should compute the hash of a simple input", async () => {
        handler = new ZeroKnowledgeHandler(
          {
            zkcircuitPath,
          },
          log,
        );
        await handler.initializeZoKrates();
        compiledCircuit = await handler.compileCircuit("parseHash.zok");
        witness = await handler.computeWitness(compiledCircuit, ["5"]);
        log.info(witness.output);
        //keypair = await handler.generateProofKeyPair(compiledCircuit);
        const managerKeyPair = Secp256k1Keys.generateKeyPairsBuffer();
        const managerJsObjectSigner = new JsObjectSigner({
          privateKey: managerKeyPair.privateKey,
        });
        log.info(managerJsObjectSigner.dataHash(5));
        //0xc6481e22c5ff4164af680b8cfaa5e8ed3120eeff89c4f307c4a6faaae059ce1
      });
    },
    TIMEOUT,
  );
});*/
