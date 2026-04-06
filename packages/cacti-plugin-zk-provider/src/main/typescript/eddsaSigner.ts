import { execSync } from "child_process";
import path from "path";

import { fileURLToPath } from "url";

export class EddsaSigner {
  private pythonPluginPath;
  constructor(signerPluginPath: string) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.pythonPluginPath = path.resolve(__dirname, signerPluginPath);
  }

  public eddsaSign(message: string): string {
    console.log(this.pythonPluginPath);
    const signatureJson_str = execSync(`python3 main.py ${message}`, {
      cwd: this.pythonPluginPath,
    });
    return signatureJson_str.toString().trim();
  }
}
