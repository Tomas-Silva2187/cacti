import { LogLevelDesc } from "@hyperledger/cactus-common";
import { GethTestLedger } from "@hyperledger/cactus-test-tooling";

export interface IEthereumTestEnvironment {
  logLevel: LogLevelDesc;
  network?: string;
}
export enum SupportedContractTypes {
  FUNGIBLE = "FUNGIBLE",
  NONFUNGIBLE = "NONFUNGIBLE",
  WRAPPER = "WRAPPER",
  ORACLE = "ORACLE",
}
export interface tokenContractName {
  assetType: SupportedContractTypes;
  contractName: string;
}
// Test environment for Ethereum ledger operations
export class EthereumTestEnvironment {
  public static readonly ETH_ASSET_ID: string = "EthereumExampleAsset";
  public static readonly ETH_NFT_ASSET_ID: string = "EthereumExampleNFT";
  public static readonly ETHREFERENCE_ID: "FUNGIBLE";
  public static readonly ETH_NETWORK_ID: string = "EthereumLedgerTestNetwork";
  public ledger!: GethTestLedger;
  public connector!: PluginLedgerConnectorEthereum;
  public connectorOptions!: IPluginLedgerConnectorEthereumOptions;
  public bungeeOptions!: IPluginBungeeHermesOptions;
  public keychainPluginFungible!: PluginKeychainMemory;
  public keychainPluginNonFungible!: PluginKeychainMemory;
  public keychainPluginWrapper!: PluginKeychainMemory;

  public keychainEntryKey!: string;
  public keychainEntryValue!: string;
  public bridgeEthAccount!: string;

  public tokenContracts: Map<SupportedContractTypes, string> = new Map<
    SupportedContractTypes,
    string
  >();
  public contractNameWrapper!: string;

  public assetContractAddresses: Map<SupportedContractTypes, string> = new Map<
    SupportedContractTypes,
    string
  >();
  public wrapperContractAddress!: string;

  public ethereumConfig!: IEthereumLeafNeworkOptions;
  public gasConfig: GasTransactionConfig | undefined = {
    gas: "6721975",
    gasPrice: "20000000000",
  };

  private dockerNetwork?: string;

  private readonly log: Logger;

  // eslint-disable-next-line prettier/prettier
  private constructor(logLevel: LogLevelDesc, network?: string) {
    if (network) {
      this.dockerNetwork = network;
    }

    this.contractNameWrapper = "SATPWrapperContract";

    const level = logLevel || "INFO";
    const label = "EthereumTestEnvironment";
    this.log = LoggerProvider.getOrCreate({ level, label });
  }

  // Initializes the Ethereum ledger, accounts, and connector for testing
  public async init(
    logLevel: LogLevelDesc,
    tokenType: tokenContractName[],
  ): Promise<void> {
    this.ledger = new GethTestLedger({
      containerImageName: "ghcr.io/hyperledger/cacti-geth-all-in-one",
      containerImageVersion: "2023-07-27-2a8c48ed6",
      networkName: this.dockerNetwork,
    });

    await this.ledger.start(false, []);

    tokenType.forEach((element) => {
      this.tokenContracts.set(element.assetType, element.contractName);
    });

    this.keychainPluginFungible = new PluginKeychainMemory({
      instanceId: uuidv4(),
      keychainId: uuidv4(),
      backend: new Map([[this.keychainEntryKey, this.keychainEntryValue]]),
      logLevel,
    });

    this.keychainPluginNonFungible = new PluginKeychainMemory({
      instanceId: uuidv4(),
      keychainId: uuidv4(),
      backend: new Map([[this.keychainEntryKey, this.keychainEntryValue]]),
      logLevel,
    });

    this.keychainPluginWrapper = new PluginKeychainMemory({
      instanceId: uuidv4(),
      keychainId: uuidv4(),
      backend: new Map([[this.keychainEntryKey, this.keychainEntryValue]]),
      logLevel,
    });

    if (this.tokenContracts.has(SupportedContractTypes.FUNGIBLE)) {
      const SATPFungibleTokenContract = {
        contractName: this.tokenContracts.get(SupportedContractTypes.FUNGIBLE),
        abi: SATPTokenContract.abi,
        bytecode: SATPTokenContract.bytecode.object,
      };
      this.keychainPluginFungible.set(
        this.tokenContracts.get(SupportedContractTypes.FUNGIBLE) ?? "",
        JSON.stringify(SATPFungibleTokenContract),
      );
    }

    if (this.tokenContracts.has(SupportedContractTypes.NONFUNGIBLE)) {
      const SATPNonFungibleTokenContract = {
        contractName: this.tokenContracts.get(
          SupportedContractTypes.NONFUNGIBLE,
        ),
        abi: SATPNFTokenContract.abi,
        bytecode: SATPNFTokenContract.bytecode.object,
      };
      this.keychainPluginNonFungible.set(
        this.tokenContracts.get(SupportedContractTypes.NONFUNGIBLE) ?? "",
        JSON.stringify(SATPNonFungibleTokenContract),
      );
    }

    const SATPWrapperContract1 = {
      contractName: "SATPWrapperContract",
      abi: SATPWrapperContract.abi,
      bytecode: SATPWrapperContract.bytecode.object,
    };

    const rpcApiWsHost = await this.ledger.getRpcApiWebSocketHost();
    this.bridgeEthAccount = await this.ledger.newEthPersonalAccount();
    this.keychainEntryValue = "test";
    this.keychainEntryKey = this.bridgeEthAccount;

    this.keychainPluginWrapper.set(
      this.contractNameWrapper,
      JSON.stringify(SATPWrapperContract1),
    );

    const pluginRegistry = new PluginRegistry({
      plugins: [
        this.keychainPluginFungible,
        this.keychainPluginNonFungible,
        this.keychainPluginWrapper,
      ],
    });

    this.connectorOptions = {
      instanceId: uuidv4(),
      rpcApiWsHost,
      pluginRegistry,
      logLevel,
    };

    this.connector = new PluginLedgerConnectorEthereum(this.connectorOptions);
  }

  public getTestFungibleContractAddress(): string {
    return (
      this.assetContractAddresses.get(SupportedContractTypes.FUNGIBLE) ?? ""
    );
  }

  public getTestFungibleContractAbi(): any {
    return SATPTokenContract.abi;
  }

  public getTestFungibleContractName(): string {
    return this.tokenContracts.get(SupportedContractTypes.FUNGIBLE) ?? "";
  }

  public getTestOwnerAccount(): string {
    return WHALE_ACCOUNT_ADDRESS;
  }

  public getTestOwnerSigningCredential(): Web3SigningCredential {
    return {
      ethAccount: WHALE_ACCOUNT_ADDRESS,
      secret: "",
      type: Web3SigningCredentialType.GethKeychainPassword,
    };
  }

  // Creates and initializes a new EthereumTestEnvironment instance
  public static async setupTestEnvironment(
    config: IEthereumTestEnvironment,
    tokenContracts: tokenContractName[],
  ): Promise<EthereumTestEnvironment> {
    const instance = new EthereumTestEnvironment(
      config.logLevel,
      config.network,
    );
    await instance.init(config.logLevel, tokenContracts);
    return instance;
  }

  // this is the config to be loaded by the gateway, does not contain the log level because it will use the one in the gateway config
  public createEthereumConfig(): INetworkOptions {
    return {
      networkIdentification: this.ethereumConfig.networkIdentification,
      signingCredential: this.ethereumConfig.signingCredential,
      wrapperContractName: this.ethereumConfig.wrapperContractName,
      wrapperContractAddress: this.ethereumConfig.wrapperContractAddress,
      gasConfig: this.ethereumConfig.gasConfig,
      connectorOptions: {
        rpcApiHttpHost: this.connectorOptions.rpcApiHttpHost,
        rpcApiWsHost: this.connectorOptions.rpcApiWsHost,
      },
      claimFormats: this.ethereumConfig.claimFormats,
    } as INetworkOptions;
  }


  public async deployAndSetupContract(assetType: SupportedContractTypes) {
    let contractKeyChain: string;
    switch (assetType) {
      case SupportedContractTypes.FUNGIBLE:
        contractKeyChain = this.keychainPluginFungible.getKeychainId();
        break;
      case SupportedContractTypes.NONFUNGIBLE:
        contractKeyChain = this.keychainPluginNonFungible.getKeychainId();
        break;
      default:
        throw new Error();
    }

    const deployOutSATPTokenContract = await this.connector.deployContract({
      contract: {
        keychainId: contractKeyChain,
        contractName: this.tokenContracts.get(assetType) ?? "",
      },
      constructorArgs: [WHALE_ACCOUNT_ADDRESS],
      web3SigningCredential: {
        ethAccount: WHALE_ACCOUNT_ADDRESS,
        secret: "",
        type: Web3SigningCredentialType.GethKeychainPassword,
      },
    });
    expect(deployOutSATPTokenContract).toBeTruthy();
    expect(deployOutSATPTokenContract.transactionReceipt).toBeTruthy();
    expect(
      deployOutSATPTokenContract.transactionReceipt.contractAddress,
    ).toBeTruthy();

    this.assetContractAddresses.set(
      assetType,
      deployOutSATPTokenContract.transactionReceipt.contractAddress ?? "",
    );
    if (this.assetContractAddresses.get(assetType) != "") {
      this.log.info(`SATPTokenContract${assetType} Deployed successfully`);
    }
  }

  public async mintTokens(
    assetAttribute: string,
    newTokenType: TokenType,
  ): Promise<void> {
    let inUseContractName: string;
    let inUseTokenAttribute: string;
    let inUseContractKeyChainId: string;
    switch (newTokenType) {
      case TokenType.NONSTANDARD_FUNGIBLE:
        inUseContractName =
          this.tokenContracts.get(SupportedContractTypes.FUNGIBLE) ?? "";
        inUseTokenAttribute = "amount";
        inUseContractKeyChainId = this.keychainPluginFungible.getKeychainId();
        break;
      case TokenType.NONSTANDARD_NONFUNGIBLE:
        inUseContractName =
          this.tokenContracts.get(SupportedContractTypes.NONFUNGIBLE) ?? "";
        inUseTokenAttribute = "tokenId";
        inUseContractKeyChainId =
          this.keychainPluginNonFungible.getKeychainId();
        break;
      default:
        throw new Error(`Unsupported token type for minting: ${newTokenType}`);
    }
    const responseMint = await this.connector.invokeContract({
      contract: {
        contractName: inUseContractName,
        keychainId: inUseContractKeyChainId,
      },
      invocationType: EthContractInvocationType.Send,
      methodName: "mint",
      params: [WHALE_ACCOUNT_ADDRESS, assetAttribute],
      web3SigningCredential: {
        ethAccount: WHALE_ACCOUNT_ADDRESS,
        secret: "",
        type: Web3SigningCredentialType.GethKeychainPassword,
      },
    });
    expect(responseMint).toBeTruthy();
    expect(responseMint.success).toBeTruthy();
    this.log.info(
      `Minted ${inUseTokenAttribute} ${assetAttribute} to firstHighNetWorthAccount`,
    );
  }

  /*public async giveRoleToBridge(wrapperAddress: string): Promise<void> {
    if (this.tokenContracts.has(SupportedContractTypes.FUNGIBLE)) {
      const giveRoleRes = await this.connector.invokeContract({
        contract: {
          contractName:
            this.tokenContracts.get(SupportedContractTypes.FUNGIBLE) ?? "",
          keychainId: this.keychainPluginFungible.getKeychainId(),
        },
        invocationType: EthContractInvocationType.Send,
        methodName: "grantBridgeRole",
        params: [wrapperAddress],
        web3SigningCredential: {
          ethAccount: WHALE_ACCOUNT_ADDRESS,
          secret: "",
          type: Web3SigningCredentialType.GethKeychainPassword,
        },
      });
      expect(giveRoleRes).toBeTruthy();
      expect(giveRoleRes.success).toBeTruthy();
      this.log.info(
        "BRIDGE_ROLE given over Fungible Token to SATPWrapperContract successfully",
      );
    }
    if (this.tokenContracts.has(SupportedContractTypes.NONFUNGIBLE)) {
      const giveRoleRes2 = await this.connector.invokeContract({
        contract: {
          contractName:
            this.tokenContracts.get(SupportedContractTypes.NONFUNGIBLE) ?? "",
          keychainId: this.keychainPluginNonFungible.getKeychainId(),
        },
        invocationType: EthContractInvocationType.Send,
        methodName: "grantBridgeRole",
        params: [wrapperAddress],
        web3SigningCredential: {
          ethAccount: WHALE_ACCOUNT_ADDRESS,
          secret: "",
          type: Web3SigningCredentialType.GethKeychainPassword,
        },
      });
      expect(giveRoleRes2).toBeTruthy();
      expect(giveRoleRes2.success).toBeTruthy();
      this.log.info(
        "BRIDGE_ROLE given over Non Fungible Token to SATPWrapperContract successfully",
      );
    }
  }*/

  /*public async approveAssets(
    wrapperAddress: string,
    assetAttribute: string,
    inUseTokenType: TokenType,
  ): Promise<void> {
    let inUseContractKeyChainId: string;
    let inUseContractName: string;
    let inUseTokenAttribute: string;
    switch (inUseTokenType) {
      case TokenType.NONSTANDARD_FUNGIBLE:
        inUseContractKeyChainId = this.keychainPluginFungible.getKeychainId();
        inUseContractName =
          this.tokenContracts.get(SupportedContractTypes.FUNGIBLE) ?? "";
        inUseTokenAttribute = "amount";
        break;
      case TokenType.NONSTANDARD_NONFUNGIBLE:
        inUseContractKeyChainId =
          this.keychainPluginNonFungible.getKeychainId();
        inUseContractName =
          this.tokenContracts.get(SupportedContractTypes.NONFUNGIBLE) ?? "";
        inUseTokenAttribute = "tokenId";
        break;
      default:
        throw new Error(
          `Unsupported token type for approval: ${inUseTokenType}`,
        );
    }
    const responseApprove = await this.connector.invokeContract({
      contract: {
        contractName: inUseContractName,
        keychainId: inUseContractKeyChainId,
      },
      invocationType: EthContractInvocationType.Send,
      methodName: "approve",
      params: [wrapperAddress, Number(assetAttribute)],
      web3SigningCredential: {
        ethAccount: WHALE_ACCOUNT_ADDRESS,
        secret: "",
        type: Web3SigningCredentialType.GethKeychainPassword,
      },
    });
    expect(responseApprove).toBeTruthy();
    expect(responseApprove.success).toBeTruthy();
    this.log.info(
      `Approved ${inUseTokenAttribute} ${assetAttribute} to SATPWrapperContract`,
    );
  }*/

  /*public async checkBalance(
    contract_name: string,
    contract_address: string,
    contract_abi: any,
    account: string,
    amount: string,
    signingCredential: Web3SigningCredential,
  ): Promise<void> {
    const responseBalanceBridge = await this.connector.invokeContract({
      contract: {
        contractJSON: {
          contractName: contract_name,
          abi: contract_abi,
          bytecode: contract_abi.object,
        },
        contractAddress: contract_address,
      },
      invocationType: EthContractInvocationType.Call,
      methodName: "balanceOf",
      params: [account],
      web3SigningCredential: signingCredential,
    });*/

    expect(responseBalanceBridge).toBeTruthy();
    expect(responseBalanceBridge.success).toBeTruthy();
    expect(responseBalanceBridge.callOutput.toString()).toBe(amount);
  }

  // Gets the default asset configuration for testing
  public get defaultAsset(): Asset {
    return {
      id: EthereumTestEnvironment.ETH_ASSET_ID,
      referenceId:
        EthereumTestEnvironment.ETHREFERENCE_ID[TokenType.NONSTANDARD_FUNGIBLE],
      owner: WHALE_ACCOUNT_ADDRESS,
      contractName:
        this.tokenContracts.get(SupportedContractTypes.FUNGIBLE) ?? "",
      contractAddress:
        this.assetContractAddresses.get(SupportedContractTypes.FUNGIBLE) ?? "",
      networkId: this.network,
      tokenType: AssetTokenTypeEnum.Fungible,
      ercTokenStandard: AssetErcTokenStandardEnum.Erc20,
    };
  }

  // Returns the whale account address used for testing transactions
  get transactRequestPubKey(): string {
    return WHALE_ACCOUNT_ADDRESS;
  }

  get bridgeSigningCredentials(): Web3SigningCredential {
    return {
      ethAccount: WHALE_ACCOUNT_ADDRESS,
      secret: "",
      type: Web3SigningCredentialType.GethKeychainPassword,
    };
  }

  // Stops and destroys the test ledger
  public async tearDown(): Promise<void> {
    await this.ledger.stop();
    await this.ledger.destroy();
  }


}
