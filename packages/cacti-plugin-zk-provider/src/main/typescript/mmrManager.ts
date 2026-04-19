import CoreMMR from "@accumulators/merkle-mountain-range";
import { KeccakHasher } from "@accumulators/hashers";
import MemoryStore from "@accumulators/memory";
import { createHash } from "crypto";

const MemoryStoreClass: typeof MemoryStore =
  (MemoryStore as any).default ?? MemoryStore;
const CoreMMRClass: typeof CoreMMR = (CoreMMR as any).default ?? CoreMMR;

export class MmrManager {
  private mmrStore = new MemoryStoreClass();
  private mmrHasher = new KeccakHasher();
  private merkleMountainRange = new CoreMMRClass(this.mmrStore, this.mmrHasher);
  constructor() {}

  public async addElementsToMMR(elementsList: string[]) {
    let mmrToAdd = "";
    elementsList.forEach((element) => {
      mmrToAdd = mmrToAdd + element;
    });
    const mmrToAddHash = createHash("sha256").update(mmrToAdd).digest("hex");
    console.log("Adding new element to MMr", mmrToAddHash);
    const elementIndex = await this.merkleMountainRange.append(
      "0x" + mmrToAddHash,
    );
    const addProof = await this.merkleMountainRange.getProof(
      elementIndex.elementIndex,
    );
    console.log(addProof);
    console.log(elementIndex);
    return { leafIndex: elementIndex, proof: addProof };
  }

  public async getElementProof(leafIndex: number) {
    return await this.merkleMountainRange.getProof(leafIndex);
  }

  public async verifyProof(leafProof: any, leafValue: string) {
    return await this.merkleMountainRange.verifyProof(leafProof, leafValue);
  }

  public async getSolidityParams(
    elementIndex: any,
    proof: any,
    value: string,
  ): Promise<any> {
    console.log("GET SOLIDITY PARAMS");
    console.log(elementIndex);
    console.log(proof);
    console.log(value);
    const peaks = await this.merkleMountainRange.getPeaks();
    const solidityVerifyProof = {
      index: elementIndex.elementIndex.toString(),
      value: value,
      proof: proof.siblingsHashes,
      peaks,
      pos: proof.elementsCount.toString(),
      rootHash: elementIndex.rootHash,
      elementsCount: elementIndex,
    };
    return solidityVerifyProof;
  }
}
