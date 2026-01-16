import {
  CompilationArtifacts,
  ComputationResult,
  Proof,
  SetupKeypair,
} from "zokrates-js";

export class ZeroKnowledgeClient {
  private server_port: number;
  private server_ip: string;
  private server_url: string;
  private circuitCompilation: CompilationArtifacts | string | undefined;
  private circuitWitness: ComputationResult | string | undefined;
  private circuitKeypair: string | SetupKeypair | undefined;
  private circuitProof: string | Proof | undefined;
  constructor(port: number, ip: string) {
    this.server_port = port;
    this.server_ip = ip;
    this.server_url = `http://${ip}:${port}`;
  }

  public getCompilation() {
    return JSON.stringify(this.circuitCompilation);
  }
  public getWitness() {
    return JSON.stringify(this.circuitWitness);
  }
  public getKeypair() {
    return JSON.stringify(this.circuitKeypair);
  }
  public getProof() {
    return JSON.stringify(this.circuitProof);
  }

  public async requestCompile(store: boolean, circuitName: string) {
    let requestBody;
    const requestUrl = `${this.server_url}/compile`;
    if (store) {
      requestBody = JSON.stringify({
        params: [{ circuitName: circuitName }],
        store: 6379,
      });
    } else {
      requestBody = JSON.stringify({
        params: [{ circuitName: circuitName }],
      });
    }
    const compilationResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    this.circuitCompilation = (await compilationResponse.json()).result;
    return "ACK";
  }

  public async requestWitness(store: boolean, inputs: any[] | undefined) {
    let requestBody;
    let compForm;
    const requestUrl = `${this.server_url}/witness`;
    if (typeof this.circuitCompilation === "string") {
      compForm = {
        fetchAt: "6379",
        key: this.circuitCompilation,
      };
    } else {
      compForm = this.circuitCompilation;
    }

    if (store) {
      requestBody = JSON.stringify({
        params: [compForm, inputs],
        store: 6379,
      });
    } else {
      requestBody = JSON.stringify({
        params: [compForm, inputs],
      });
    }
    const witnessResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    this.circuitWitness = (await witnessResponse.json()).result;
    return "ACK";
  }

  public async requestKeypair(store: boolean) {
    let requestBody;
    let compForm;
    const requestUrl = `${this.server_url}/keypair`;
    if (typeof this.circuitCompilation === "string") {
      compForm = {
        fetchAt: "6379",
        key: this.circuitCompilation,
      };
    } else {
      compForm = this.circuitCompilation;
    }

    if (store) {
      requestBody = JSON.stringify({
        params: [compForm],
        store: 6379,
      });
    } else {
      requestBody = JSON.stringify({
        params: [compForm],
      });
    }
    const keypairResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    this.circuitKeypair = (await keypairResponse.json()).result;
    return "ACK";
  }

  public async requestProof(store: boolean) {
    let requestBody;
    let compForm;
    let witnessForm;
    let keypairForm;
    const requestUrl = `${this.server_url}/generate`;
    if (typeof this.circuitCompilation === "string") {
      compForm = {
        fetchAt: "6379",
        key: this.circuitCompilation,
      };
    } else {
      compForm = this.circuitCompilation;
    }

    if (typeof this.circuitWitness === "string") {
      witnessForm = {
        fetchAt: "6379",
        key: this.circuitWitness,
      };
    } else {
      witnessForm = this.circuitWitness;
    }

    if (typeof this.circuitKeypair === "string") {
      keypairForm = {
        fetchAt: "6379",
        key: this.circuitKeypair,
      };
    } else {
      keypairForm = this.circuitKeypair;
    }

    if (store) {
      requestBody = JSON.stringify({
        params: [compForm, witnessForm, keypairForm],
        store: 6379,
      });
    } else {
      requestBody = JSON.stringify({
        params: [compForm, witnessForm, keypairForm],
      });
    }
    const proofResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    this.circuitProof = (await proofResponse.json()).result;
    return "ACK";
  }

  public async requestProofVerification() {
    let proofForm;
    let keypairForm;
    const requestUrl = `${this.server_url}/verify`;
    if (typeof this.circuitProof === "string") {
      proofForm = {
        fetchAt: "6379",
        key: this.circuitProof,
      };
    } else {
      proofForm = this.circuitProof;
    }

    if (typeof this.circuitKeypair === "string") {
      keypairForm = {
        fetchAt: "6379",
        key: this.circuitKeypair,
      };
    } else {
      keypairForm = this.circuitKeypair;
    }

    const requestBody = JSON.stringify({
      params: [proofForm, keypairForm],
    });

    const verifyResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    return (await verifyResponse.json()).result;
  }

  public async requestCircuitLoad(
    circuitID: string,
    circuitCredentials: string,
  ) {
    const requestUrl = `${this.server_url}/loadCircuit`;
    const requestBody = JSON.stringify({
      circuitID: circuitID,
      circuitCredentials: circuitCredentials,
    });
    const loadResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    return (await loadResponse.json()).result;
  }
}
