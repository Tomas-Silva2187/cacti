import CoreMMR from "@herodotus_dev/mmr-core";
import { KeccakHasher } from "@herodotus_dev/mmr-hashes";
import MMRInMemoryStore from "@herodotus_dev/mmr-memory";
import { createHash } from "crypto";

export class MmrManager {
  private mmrStore = new MMRInMemoryStore();
  private mmrHasher = new KeccakHasher();
  private merkleMountainRange = new CoreMMR(this.mmrStore, this.mmrHasher);
  constructor() {}

  public async addElementsToMMR(elementsList: string[]) {
    let mmrToAdd = "";
    elementsList.forEach((element) => {
      mmrToAdd = mmrToAdd + element;
    });
    const mmrToAddHash = createHash("sha256").update(mmrToAdd).digest("hex");
    console.log("Adding new element ", mmrToAddHash);
    const { leafIndex } = await this.merkleMountainRange.append(
      "0x" + mmrToAddHash,
    );
    const addProof = await this.merkleMountainRange.getProof(leafIndex);
    return { leafIndex: leafIndex, proof: addProof };
  }

  public async getElementProof(leafIndex: number) {
    return await this.merkleMountainRange.getProof(leafIndex);
  }

  public async verifyProof(leafProof: any, leafValue: string) {
    return await this.merkleMountainRange.verifyProof(leafProof, leafValue);
  }
}
