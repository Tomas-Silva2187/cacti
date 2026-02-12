import { Proof, VerificationKey } from "zokrates-js";
import { FetchData } from "../utils";

export class ZeroKnowledgeClient {
  private server_port: number;
  private dbPort: number;
  private server_ip: string;
  private server_url: string;
  private circuitVerificationKey: string | VerificationKey | undefined;
  private circuitProof: string | Proof | undefined;
  constructor(port: number, ip: string, dbPort?: number) {
    this.server_port = port;
    this.server_ip = ip;
    this.server_url = `http://${ip}:${port}`;
    this.dbPort = dbPort || 6379;
  }

  public getVerificationKey() {
    return this.circuitVerificationKey;
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
    const requestBody = this.formatRequestBody(store, [
      { circuitName: circuitName },
    ]);
    const compilationResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    this.circuitVerificationKey = (await compilationResponse.json()).result;
    return "ACK";
  }

  public async requestWitness(inputs: any[] | undefined) {
    const requestUrl = `${this.server_url}/witness`;
    const requestBody = this.formatRequestBody(false, [inputs]);
    const witnessResponse = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    if ((await witnessResponse.json()).result == "OK") {
      return "ACK";
    } else {
      return "NACK";
    }
  }

  public async requestProof(store: boolean) {
    const requestUrl = `${this.server_url}/generate`;
    const requestBody = this.formatRequestBody(store, []);

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
    const vkArtifact = this.formatInput(this.circuitVerificationKey);
    const requestBody = JSON.stringify({
      params: [proofArtifacts, vkArtifact],
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
    console.log(
      `Performing a fetch request for circuit ID: ${circuitID} to ${this.server_url}/fetchCircuit...`,
    );
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
