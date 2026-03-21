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
  GEN_CHAIN_PROOF = "/generateChainProof",
}

export class ServerClient {
  private server_url: string;
  constructor(port: number, ip: string) {
    this.server_url = `http://${ip}:${port}`;
  }
  //===================================================================================================
  //======================================    [PCU Related]   =========================================
  //===================================================================================================
  public async compileCircuit(circuitName: string, chainAction?: string) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.COMPILE}`;
      let requestBody;
      if (chainAction) {
        requestBody = JSON.stringify({
          circuitName: circuitName,
          chainAction: chainAction,
        });
      } else {
        requestBody = JSON.stringify({
          circuitName: circuitName,
        });
      }
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async generateZkSnark(
    inputs: string[],
    sessionId: string,
    chainAction?: string,
  ) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.GEN_PROOF}`;
      let requestBody;
      if (chainAction) {
        requestBody = JSON.stringify({
          params: inputs,
          sessionId: sessionId,
          chainAction: chainAction,
        });
      } else {
        requestBody = JSON.stringify({
          params: inputs,
          sessionId: sessionId,
        });
      }
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async generateChainZkSnark(
    txHash: string,
    sessionId: string,
    chainAction?: string,
  ) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.GEN_PROOF}`;
      let requestBody;
      if (chainAction) {
        requestBody = JSON.stringify({
          txHash: txHash,
          sessionId: sessionId,
          chainAction: chainAction,
        });
      } else {
        requestBody = JSON.stringify({
          txHash: txHash,
          sessionId: sessionId,
        });
      }
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async verifyZkSnark(
    proof: string,
    chainId: string,
    version: string,
    chainAction?: string,
  ) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.VRF_PROOF}`;
      let requestBody;
      if (chainAction) {
        requestBody = JSON.stringify({
          proof: proof,
          chainId: chainId,
          v: version,
          chainAction: chainAction,
        });
      } else {
        requestBody = JSON.stringify({
          proof: proof,
          chainId: chainId,
          v: version,
        });
      }
      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async loadVerificationKey(
    circuitVersion: string,
    chainId: string,
    chainAction?: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.VK_LOAD}`;
    let requestBody;
    if (chainAction) {
      requestBody = JSON.stringify({
        v: circuitVersion,
        chainId: chainId,
        chainAction: chainAction,
      });
    } else {
      requestBody = JSON.stringify({
        v: circuitVersion,
        chainId: chainId,
      });
    }
    console.log("\n\n\nRequest: ", requestBody);
    const request = await this.executeRequest(requestUrl, requestBody);
    console.log(request);
    return request;
  }
  //===================================================================================================
  //============================    [Credential Server Related]   =====================================
  //===================================================================================================
  public async postCredential(
    credential: string,
    circuitVersion: string,
    chainId: string,
    chainAction?: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.POST_CREDENTIAL}`;
    let requestBody;
    if (chainAction) {
      requestBody = JSON.stringify({
        cred: credential,
        v: circuitVersion,
        chainId: chainId,
        chainAction: chainAction,
      });
    } else {
      requestBody = JSON.stringify({
        cred: credential,
        v: circuitVersion,
        chainId: chainId,
      });
    }
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }

  public async getCredential(
    circuitVersion: string,
    chainId: string,
    chainAction?: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.GET_CREDENTIAL}`;
    let requestBody;
    if (chainAction) {
      requestBody = JSON.stringify({
        v: circuitVersion,
        chainId: chainId,
        chainAction: chainAction,
      });
    } else {
      requestBody = JSON.stringify({
        v: circuitVersion,
        chainId: chainId,
      });
    }
    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }
  //===================================================================================================
  //============================    [External Server Related]   =======================================
  //===================================================================================================
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

  public async postVerificationKey(
    vk: string,
    circuitVersion: string,
    chainId: string,
    vkCredential: string,
    chainAction?: string,
  ) {
    try {
      const requestUrl = `${this.server_url}${Endpoints.POST_VK}`;
      let requestBody;
      if (chainAction) {
        requestBody = JSON.stringify({
          vk: vk,
          v: circuitVersion,
          chainId: chainId,
          cred: vkCredential,
          chainAction: chainAction,
        });
      } else {
        requestBody = JSON.stringify({
          vk: vk,
          v: circuitVersion,
          chainId: chainId,
          cred: vkCredential,
        });
      }

      const request = await this.executeRequest(requestUrl, requestBody);
      return request;
    } catch (error) {
      throw error;
    }
  }

  public async getVerificationKey(
    circuitVersion: string,
    chainId: string,
    chainAction?: string,
  ) {
    const requestUrl = `${this.server_url}${Endpoints.GET_VK}`;
    let requestBody;
    if (chainAction) {
      requestBody = JSON.stringify({
        v: circuitVersion,
        chainId: chainId,
        chainAction: chainAction,
      });
    } else {
      requestBody = JSON.stringify({
        v: circuitVersion,
        chainId: chainId,
      });
    }

    const request = await this.executeRequest(requestUrl, requestBody);
    return request;
  }
  //===================================================================================================
  //======================================    Old Functions   =========================================
  //===================================================================================================
  private async executeRequest(requestUrl: string, requestBody: any) {
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
