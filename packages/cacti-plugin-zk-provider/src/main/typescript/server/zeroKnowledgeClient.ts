import {
  CompilationArtifacts,
  ComputationResult,
  Proof,
  SetupKeypair,
} from "zokrates-js";
import { FetchData } from "../utils";

export class ZeroKnowledgeClient {
  private server_port: number;
  private dbPort: number;
  private server_ip: string;
  private server_url: string;
  private circuitCompilation: CompilationArtifacts | string | undefined;
  private circuitWitness: ComputationResult | string | undefined;
  private circuitKeypair: string | SetupKeypair | undefined;
  private circuitProof: string | Proof | undefined;
  constructor(port: number, ip: string, dbPort?: number) {
    this.server_port = port;
    this.server_ip = ip;
    this.server_url = `http://${ip}:${port}`;
    this.dbPort = dbPort || 6379;
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

  private formatInput(data: any) {
    if (typeof data === "string") {
      return {
        fetchAt: this.dbPort.toString(),
        key: data,
      };
    } else {
      return data;
    }
  }

  private formatRequestBody(store: boolean, params: any[]) {
    if (store) {
      return JSON.stringify({
        params: params,
        store: this.dbPort,
      });
    } else {
      return JSON.stringify({
        params: params,
      });
    }
  }

  public async blindRequest(endpointName: string, inputs: any[]) {
    const requestUrl = `${this.server_url}/${endpointName}`;
    const requestBody = JSON.stringify({
      params: inputs,
    });
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    return (await response.json()).result;
  }

  public async requestCompile(store: boolean, circuitName: string) {
    const requestUrl = `${this.server_url}/compile`;
    const requestBody = this.formatRequestBody(store, [{ circuitName: circuitName }]);
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
    const requestUrl = `${this.server_url}/witness`;
    const compilationArtifacts = this.formatInput(this.circuitCompilation);
    const requestBody = this.formatRequestBody(store, [compilationArtifacts, inputs]);
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
    const requestUrl = `${this.server_url}/keypair`;
    const compilationArtifacts = this.formatInput(this.circuitCompilation);
    const requestBody = this.formatRequestBody(store, [compilationArtifacts]);
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
    const requestUrl = `${this.server_url}/generate`;
    const compilationArtifacts = this.formatInput(this.circuitCompilation);
    const witnessArtifacts = this.formatInput(this.circuitWitness);
    const keypairArtifacts = this.formatInput(this.circuitKeypair);
    const requestBody = this.formatRequestBody(store, [compilationArtifacts, witnessArtifacts, keypairArtifacts]);

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
    const requestUrl = `${this.server_url}/verify`;
    const proofArtifacts = this.formatInput(this.circuitProof);
    const keypairArtifacts = this.formatInput(this.circuitKeypair);
    const requestBody = JSON.stringify({
      params: [proofArtifacts, keypairArtifacts],
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
    verificationMethod: string,
    fetchData?: FetchData,
  ) {
    const requestUrl = `${this.server_url}/loadCircuit`;
    const requestBody = JSON.stringify({
      circuitID: circuitID,
      verificationMethod: verificationMethod,
      fetchData: fetchData,
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

  public async fetchCircuit(circuitID: string) {
    console.log(`Performing a fetch request for circuit ID: ${circuitID} to ${this.server_url}/fetchCircuit...`);
    const requestUrl = `${this.server_url}/fetchCircuit`;
    const requestBody = JSON.stringify({
      circuitID: circuitID,
    });
    console.log("url: ", requestUrl);
    console.log("body: ", requestBody);
    const fetchResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    return (await fetchResponse.json()).result;
  }
}
