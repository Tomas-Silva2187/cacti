import { ServerClient } from "./main/typescript/server/ServerClient.js";
import { EthereumContractDeployer } from "./test/typescript/ethereumChain.js";
import { createHash } from "crypto";

try {
  const mockContractDeployer = new EthereumContractDeployer();
  let ACCOUNTS = false;
  let MMRCON = false;

  const extClient = new ServerClient(12803, "localhost");
  const pSessionId13 =
    "amockamockamockamockamockamockamockamockamockamoc1:mint";

  await mockContractDeployer.deployERC20Contract();
  const mintTransaction = await mockContractDeployer.mintTokens(1000);
  const save = await extClient.postProof(
    mintTransaction.hash,
    "1",
    pSessionId13,
    "BESU_2X",
    "mint",
  );
  const rehash1 = createHash("sha256")
    .update(mintTransaction.hash)
    .digest("hex");
  const rehash2 = createHash("sha256").update(rehash1).digest("hex");
  console.log(save);
  const res = JSON.parse(save);
  const res2 = JSON.parse(res.mmrData);
  if (!ACCOUNTS) {
    await mockContractDeployer.deployERC20Contract();
    ACCOUNTS = true;
  }
  if (!MMRCON) {
    await mockContractDeployer.deployMMRContract();
    MMRCON = true;
  }

  const append = await mockContractDeployer.appendElement(
    "0x" + rehash2,
    res2.rootHash,
    res2.peaks,
    res2.elementsCount.elementsCount,
  );
  console.log(append);
} catch (error) {
  throw error;
}
