import { execSync } from "child_process";
import path from "path";

export class EddsaSigner {
  private pythonPluginPath;
  constructor(signerPluginPath: string) {
    this.pythonPluginPath = path.resolve(__dirname, signerPluginPath);
  }

  public eddsaSign(message: string): string {
    console.log("SIGNERPATH: ", this.pythonPluginPath);
    const signatureJson_str = execSync(`python3 main.py ${message}`, {
      cwd: this.pythonPluginPath,
    });
    return signatureJson_str.toString().trim();
  }
}
