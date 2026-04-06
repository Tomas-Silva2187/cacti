import { describe, expect, it } from "vitest";
import { MmrManager } from "../../../main/typescript/mmrManager";

describe("MMR Operations", () => {
  describe("MMR Basics", async () => {
    const mmrManager = new MmrManager();
    it("should setup a mmr builder class", async () => {
      const newValue = "MyNewValue";
      const newValue2 = "MyNewValue2";
      const addingProof = await mmrManager.addElementsToMMR([newValue]);
      expect(addingProof).toBeDefined;
      console.log(addingProof.proof);
      const addingProof2 = await mmrManager.addElementsToMMR([newValue2]);
      console.log(addingProof2);
    });
  });
});
