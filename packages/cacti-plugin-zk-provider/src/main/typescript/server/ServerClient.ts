export enum Endpoints {
  POST_VK = "/postVerificationKey",
  GET_VK = "/getVerificationKey",
  POST_PROOF = "/postProof",
  GET_PROOF = "/getProof",
  POST_CREDENTIAL = "/postCredential",
  GET_CREDENTIAL = "/getCredential",
  //PCU Endpoints
  VK_LOAD = "/loadThirdPartyVerificationKey",
  COMPILE = "/compileCircuit",
  GEN_PROOF = "/generateProof",
  VRF_PROOF = "/verifyProof",
  VERSION = "/circuitVersion",
}

export class ServerClient {
  private server_url: string;
  constructor(port: number, ip: string) {
    this.server_url = `http://${ip}:${port}`;
  }

  public async compileCircuit(circuitName: string) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.COMPILE}`;
      const requestBody = JSON.stringify({
        circuitName: circuitName,
      });
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async generateZkSnark(inputs: string[]) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.GEN_PROOF}`;
      const requestBody = JSON.stringify({
        params: inputs,
      });
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async verifyZkSnark(proof: string, chainId: string, version: string) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.VRF_PROOF}`;
      const requestBody = JSON.stringify({
        proof: proof,
        chainId: chainId,
        v: version,
      });
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async loadVerificationKey(circuitVersion: string, chainId: string) {
    const requestUrl = `${this.server_url}${Endpoints.VK_LOAD}`;
    const requestBody = JSON.stringify({
      v: circuitVersion,
      chainId: chainId,
    });
    const request = await this.executeRequest(requestUrl, requestBody);
    console.log(request);
    return request;
  }

  public async postVerificationKey(
    vk: string,
    circuitVersion: string,
    chainId: string,
    vkCredential: string,
  ) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.POST_VK}`;
      const requestBody = JSON.stringify({
        vk: vk,
        v: circuitVersion,
        chainId: chainId,
        cred: vkCredential,
      });
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async getVerificationKey(circuitVersion: string, chainId: string) {
    const requestUrl = `${this.server_url}${Endpoints.GET_VK}`;
    const requestBody = JSON.stringify({
      v: circuitVersion,
      chainId: chainId,
    });
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }

  public async postCredential(
    credential: string,
    circuitVersion: string,
    chainId: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.POST_CREDENTIAL}`;
    const requestBody = JSON.stringify({
      cred: credential,
      v: circuitVersion,
      chainId: chainId,
    });
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }

  public async getCredential(circuitVersion: string, chainId: string) {
    const requestUrl = `${this.server_url}${Endpoints.GET_CREDENTIAL}`;
    const requestBody = JSON.stringify({
      v: circuitVersion,
      chainId: chainId,
    });
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }

  public async postProof(
    proof: string,
    circuitVersion: string,
    sessionId: string,
    chainId: string,
    chainAction: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.POST_PROOF}`;
    const requestBody = JSON.stringify({
      proof: proof,
      v: circuitVersion,
      sessionId: sessionId,
      chainId: chainId,
      chainAction: chainAction,
    });
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }

  public async getProof(
    circuitVersion: string,
    sessionId: string,
    chainId: string,
    chainAction: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.GET_PROOF}`;
    const requestBody = JSON.stringify({
      v: circuitVersion,
      sessionId: sessionId,
      chainId: chainId,
      chainAction: chainAction,
    });
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }

  private async executeRequest(
    requestUrl: string,
    requestBody: any,
  ): Promise<string> {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    const responseContent = await response.json();
    if (responseContent.error) {
      throw new Error(responseContent.error);
    }
    return responseContent.result;
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
}
