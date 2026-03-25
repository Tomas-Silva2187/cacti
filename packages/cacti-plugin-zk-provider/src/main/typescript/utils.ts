export interface ServerUrl {
  ip: string;
  port: number;
  ownerChainId?: string;
}

export enum RequestTarget {
  DB = "DB",
  SERVER = "SERVER",
}

export interface FetchData {
  infrastructureElement: RequestTarget;
  url?: ServerUrl;
}

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
  GEN_SIG_PROOF = "/generateSignatureProof",
}
