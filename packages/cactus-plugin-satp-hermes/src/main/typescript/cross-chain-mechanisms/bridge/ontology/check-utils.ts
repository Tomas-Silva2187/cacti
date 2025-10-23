import { JsObjectSigner } from "@hyperledger/cactus-common";
import { getInteractionType, InteractionType } from "./assets/interact-types";
import { isObject, isString } from "class-validator";
import { LedgerType } from "@hyperledger/cactus-core-api";
import {
  VarType as EvmVarType,
  getVarTypes as getEvmVarType,
} from "./assets/evm-asset";
import {
  VarType as FabricVarType,
  getVarTypes as getFabricVarType,
} from "./assets/fabric-asset";

export enum OntologyCheckLevel {
  DEFAULT = "DEFAULT",
  HASHED = "HASHED",
  HASHED_SIGNED = "HASHED_SIGNED",
}

export interface OntologyJson {
  name: string;
  id: string;
  type: string;
  contract: string;
  ontology: Record<string, OntologyFunction[]>;
  bytecode: string;
  hash: string;
  signature: string;
}

export interface OntologyFunction {
  functionSignature: string;
  variables: string[];
  available?: string;
}

export function isValidOntologyJsonFormat(ontologyJSON: any) {
  if (typeof ontologyJSON !== "object" || ontologyJSON === null) {
    throw new Error("Provided ontology is null or not an object");
  }
  if (
    !("name" in ontologyJSON && isString(ontologyJSON.name)) ||
    !("id" in ontologyJSON && isString(ontologyJSON.id)) ||
    !("type" in ontologyJSON && isString(ontologyJSON.type)) ||
    !("contract" in ontologyJSON && isString(ontologyJSON.contract)) ||
    !("ontology" in ontologyJSON && isObject(ontologyJSON.ontology)) ||
    !("bytecode" in ontologyJSON && isString(ontologyJSON.bytecode)) ||
    !("hash" in ontologyJSON && isString(ontologyJSON.hash)) ||
    !("signature" in ontologyJSON && isString(ontologyJSON.signature))
  ) {
    throw new Error(
      "Provided Ontology not supported by necessary additional fields",
    );
  }
  return ontologyJSON as OntologyJson;
}

export function checkOntologyContent(
  ontology: OntologyJson,
  pubKeyArray?: Uint8Array[],
  JsObjectSigner?: JsObjectSigner,
  level: OntologyCheckLevel = OntologyCheckLevel.DEFAULT,
) {
  // levels should be listed from most to least strict - most strict levels need to perform all checks of the less strict levels
  switch (level) {
    case OntologyCheckLevel.HASHED_SIGNED:
      validateOntologySignature(ontology, pubKeyArray!, JsObjectSigner!);
      break;
    case OntologyCheckLevel.HASHED:
      validateOntologyHash(ontology, JsObjectSigner!);
      break;
    case OntologyCheckLevel.DEFAULT:
      validateOntologyFunctions(ontology);
      break;
  }
}

/**
 * Confirms if a hash string is valid for an ontology
 * @param {any} ontology - the ontology field.
 * @param {string} hash - the hash to attest.
 * @param {JsObjectSigner} JsObjectSigner - the hash verifier.
 * @returns Whether the hash is valid or not.
 */
export function validateOntologyHash(
  ontologyJSON: OntologyJson,
  JsObjectSigner: JsObjectSigner,
) {
  try {
    const objToHash = JSON.parse(JSON.stringify(ontologyJSON));
    delete objToHash.hash;
    delete objToHash.signature;
    const validHash =
      JsObjectSigner.dataHash(objToHash).toString() === ontologyJSON.hash;
    return validHash;
  } catch (error) {
    return false;
  }
}

/**
 * Confirms the validity of a signature string from an ontology
 * @param {any} ontology - the signed ontology field.
 * @param {Uint8Array} pubKey - a public key to attest the signature.
 * @param {string} signature - the signature to attest.
 * @param {JsObjectSigner} JsObjectSigner - the signature verifier.
 * @returns Whether the signature is valid for the provided key or not.
 */
export function validateOntologySignature(
  ontologyJSON: OntologyJson,
  pubKeys: Uint8Array[],
  JsObjectSigner: JsObjectSigner,
) {
  try {
    const objToHash = JSON.parse(JSON.stringify(ontologyJSON));
    delete objToHash.hash;
    delete objToHash.signature;
    for (const key of pubKeys) {
      const validBridgeSignature = JsObjectSigner.verify(
        JsObjectSigner.dataHash(objToHash),
        new Uint8Array(ontologyJSON.signature.split(",").map(Number)),
        key,
      );
      if (validBridgeSignature) {
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

export function validateOntologyFunctions(ontology: OntologyJson) {
  const ontologyInteractions = ontology.ontology;
  for (const [interaction, interactionFunctions] of Object.entries(ontologyInteractions)) {
    if (!(getInteractionType(interaction) in InteractionType)) {
      throw new Error(`Interaction ${interaction} not recognized in ontology`);
    }
    if (interactionFunctions.length === 0) {
      throw new Error(`No functions defined for interaction ${interaction}`);
    }
    for (const functionData of interactionFunctions) {
      switch (ontology.type as LedgerType) {
        case LedgerType.Ethereum:
        case LedgerType.Besu1X:
        case LedgerType.Besu2X:
          if (functionData.available !== "true") {
            throw new Error(
              `Function ${functionData.functionSignature} not available in ontology`,
            );
          }
          for (const variable of functionData.variables) {
            if (!(getEvmVarType(variable) in EvmVarType)) {
              throw new Error(
                `Variable type ${variable} not recognized in ontology for EVM`,
              );
            }
          }
          break;
        case LedgerType.Fabric2:
          for (const variable of functionData.variables) {
            if (!(getFabricVarType(variable) in FabricVarType)) {
              throw new Error(
                `Variable type ${variable} not recognized in ontology for Fabric`,
              );
            }
          }
          break;
        default:
          throw new Error(
            `Ledger type ${ontology.type} not supported for ontology validation`,
          );
      }
    }
  }
  return true;
}

export function validateOntologyBytecode(
  ontology: OntologyJson,
  ledgerType: LedgerType,
) {
  throw new Error("Function not implemented.");
}
