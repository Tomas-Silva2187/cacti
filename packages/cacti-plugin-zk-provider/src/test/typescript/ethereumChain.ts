import { ethers } from "ethers";
import erc20 from "../solidity/generated/CustomERC20.sol/CustomERC20.json" assert { type: "json" };
import { RLP } from "@ethereumjs/rlp";
import { Trie } from "@ethereumjs/trie";
import { bytesToHex } from "@ethereumjs/util";
export class EthereumContractDeployer {
  private provider;
  private accounts;
  private deployerAddress;
  private userAddress;
  private callerAddress;
  private deployerSignerAccount;
  private ABI = erc20.abi;
  private BYTECODE = erc20.bytecode;
  private TOKEN_CONTRACT_ADDRESS;
  constructor() {
    this.provider = new ethers.JsonRpcProvider("http://0.0.0.0:8545");
  }

  async deployERC20Contract() {
    this.accounts = await this.provider.listAccounts();
    this.deployerAddress = this.accounts[0].address;
    this.userAddress = this.accounts[1].address;
    this.callerAddress = this.accounts[2].address;

    this.deployerSignerAccount = await this.provider.getSigner(
      this.deployerAddress,
    );

    console.log("Deploying an erc20 token contract");
    const ContractFactory = new ethers.ContractFactory(
      this.ABI,
      this.BYTECODE,
      this.deployerSignerAccount,
    );

    const contractDeploymentTx = await ContractFactory.deploy(
      this.deployerAddress,
    );
    await contractDeploymentTx.waitForDeployment();

    const giveRoleTx = await new ethers.Contract(
      await contractDeploymentTx.getAddress(),
      this.ABI,
      this.deployerSignerAccount,
    ).grantBridgeRole(this.callerAddress);

    await giveRoleTx.wait();
    this.TOKEN_CONTRACT_ADDRESS = await contractDeploymentTx.getAddress();
  }

  async mintTokens() {
    const mintTx = await new ethers.Contract(
      this.TOKEN_CONTRACT_ADDRESS,
      this.ABI,
      this.deployerSignerAccount,
    ).mint(this.userAddress, 1000);
    await mintTx.wait();

    return mintTx;
  }

  async fetchBlock(blockNumber: string = "latest") {
    const block = await this.provider.getBlock(blockNumber, true);
    console.log(`BLOCK ${blockNumber} : `, block);
    return block;
  }

  async fetchTransactionFromBlock(block: any, txHash: string) {
    const tx1 = await block.getPrefetchedTransaction(txHash);
    console.log(`TX from Block: `, tx1);
    return tx1;
  }

  async fetchTransactionReceipt(txHash: string) {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    console.log(`TX Receipt: `, receipt);
    return receipt;
  }

  async rlpEncodeReceipt(tx: any) {
    const receipt = await this.fetchTransactionReceipt(tx.hash);
    const status = receipt.status === 1 ? Buffer.from([1]) : Buffer.alloc(0);
    const cumulativeGas = receipt.cumulativeGasUsed;
    const logsBloom = receipt.logsBloom;
    const logs = receipt.logs.map((log) => [log.address, log.topics, log.data]);
    const receiptData = [status, cumulativeGas, logsBloom, logs];
    const rlpEncoded = RLP.encode(receiptData);
    let finalRlpEncoded;
    if (receipt.type !== 0) {
      const v = Uint8Array.from([receipt.type]);
      finalRlpEncoded = new Uint8Array(v.length + rlpEncoded.length);
      finalRlpEncoded.set(v);
      finalRlpEncoded.set(rlpEncoded, v.length);
    } else {
      finalRlpEncoded = rlpEncoded;
    }
    return finalRlpEncoded;
  }

  async getTrieRoot(rlpEncoded: any) {
    const trie = await Trie.create();
    await trie.put(RLP.encode(0), rlpEncoded);
    const myRoot = bytesToHex(await trie.root());
    console.log("MY ROOT COMPUTED LOCALLY", myRoot);
  }
}
const p = new EthereumContractDeployer();
await p.deployERC20Contract();
await p.mintTokens();
