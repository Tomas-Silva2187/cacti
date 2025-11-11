import {
  GasTransactionConfig,
  Web3SigningCredential as EthereumWeb3SigningCredential,
} from "@hyperledger/cactus-plugin-ledger-connector-ethereum/";
import { Web3SigningCredential as BesuWeb3SigningCredential } from "@hyperledger/cactus-plugin-ledger-connector-besu/";
import { ClaimFormat, NetworkId } from "../../public-api";
import { IBridgeLeafOptions } from "./bridge-leaf";
import { IPluginLedgerConnectorEthereumOptions } from "@hyperledger/cactus-plugin-ledger-connector-ethereum/";
import { IPluginLedgerConnectorBesuOptions } from "@hyperledger/cactus-plugin-ledger-connector-besu/";
import { BesuGasConfig } from "../../services/validation/config-validating-functions/bridges-config-validating-functions/validate-besu-config";
import { ISignerKeyPair } from "@hyperledger/cactus-common/";

export interface TransactionResponse {
  transactionId?: string;
  transactionReceipt?: string;
  output?: unknown;
}

export interface INetworkOptions {
  networkIdentification: NetworkId;
}
export interface IEthereumNetworkConfig extends INetworkOptions {
  signingCredential: EthereumWeb3SigningCredential;
  connectorOptions: Partial<IPluginLedgerConnectorEthereumOptions>;
  wrapperContractName?: string;
  wrapperContractAddress?: string;
  gasConfig?: GasTransactionConfig;
  leafId?: string;
  keyPair?: ISignerKeyPair;
  claimFormats?: ClaimFormat[];
}
export interface IEthereumLeafOptions
  extends IBridgeLeafOptions,
    IEthereumNetworkConfig {}

export interface IBesuNetworkConfig extends INetworkOptions {
  signingCredential: BesuWeb3SigningCredential;
  connectorOptions: Partial<IPluginLedgerConnectorBesuOptions>;
  leafId?: string;
  keyPair?: ISignerKeyPair;
  claimFormats?: ClaimFormat[];
  wrapperContractName?: string;
  wrapperContractAddress?: string;
  gasConfig?: BesuGasConfig;
}

export interface IBesuLeafOptions
  extends IBridgeLeafOptions,
    IBesuNetworkConfig {}
