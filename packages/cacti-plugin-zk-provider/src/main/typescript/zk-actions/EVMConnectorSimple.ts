import { ethers } from "ethers";
export type TransactionLog = {
  _type: string;
  address: string;
  blockHash: string;
  blockNumber: number;
  data: string;
  index: number;
  topics: string[];
  transactionHash: string;
  transactionIndex: number;
};
export type TransactionReceipt = {
  _type: string;
  blockHash: string;
  blockNumber: number;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gasPrice: string;
  blobGasUsed: string;
  blobGasPrice: string;
  gasUsed: string;
  hash: string;
  index: number;
  logs: TransactionLog[];
  logsBloom: string;
  status: number;
  to: string;
};
export class EVMConnectorSimple {
  private provider;

  constructor(port: string, ip?: string, connectionType?: string) {
    const conn = connectionType ?? "http";
    const chainIp = ip ?? "0.0.0.0";
    if (conn == "http") {
      this.provider = new ethers.JsonRpcProvider(`http://${chainIp}:${port}`);
    } else {
      this.provider = new ethers.WebSocketProvider(`ws://${chainIp}:${port}`);
    }
  }

  async fetchBlock(blockNumber: number | string = "latest") {
    const block = await this.provider.getBlock(blockNumber, true);
    return block;
  }

  async fetchTransactionFromBlock(block: any, txHash: string) {
    const tx1 = await block.getPrefetchedTransaction(txHash);
    return tx1;
  }

  async fetchTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    const receiptFormated = JSON.parse(
      JSON.stringify(receipt),
    ) as TransactionReceipt;
    return receiptFormated;
  }
}
