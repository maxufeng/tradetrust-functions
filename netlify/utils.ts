import {
  openAttestationVerifiers,
  openAttestationDidIdentityProof,
  verificationBuilder,
  isValid,
} from "@tradetrust-tt/tt-verify";
import {
  WrappedDocument,
  OpenAttestationDocument,
  utils,
} from "@tradetrust-tt/tradetrust";
import { encryptString } from "@govtechsg/oa-encryption";
import { networkName } from "@tradetrust-tt/tradetrust-utils/constants/network";
import createError from "http-errors";
import {
  ALLOWED_ORIGINS,
  ERROR_MESSAGE,
  SUPPORTED_NETWORKS,
} from "./constants";
import { ethers } from "ethers";

// https://github.com/expressjs/cors#configuring-cors-w-dynamic-origin
export const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // allow requests with no origin, like mobile apps or curl requests

  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, true);
  } else {
    return callback(new Error(ERROR_MESSAGE.CORS_UNALLOWED), false);
  }
};

export const checkApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.API_KEY) {
    return res.status(400).send(ERROR_MESSAGE.API_KEY_INVALID);
  }
  next();
};

const getSupportedNetwork = (network: networkName) => {
  return Object.values(SUPPORTED_NETWORKS).find(
    (item) => item.name === network,
  );
};

export const validateNetwork = async (
  document: WrappedDocument<OpenAttestationDocument>,
) => {
  if (utils.isWrappedV2Document(document)) {
    const { network } = utils.getData(document);

    if (!network) {
      throw new createError(400, ERROR_MESSAGE.DOCUMENT_NETWORK_NOT_FOUND);
    } else {
      return network;
    }
  } else if (utils.isWrappedV3Document(document)) {
    const { network } = document;

    if (!network) {
      throw new createError(400, ERROR_MESSAGE.DOCUMENT_NETWORK_NOT_FOUND);
    } else {
      return network;
    }
  } else {
    throw new createError(400, ERROR_MESSAGE.DOCUMENT_SCHEMA_INVALID);
  }
};

export const validateDocument = async ({
  document,
  network,
}: {
  document: WrappedDocument<OpenAttestationDocument>;
  network: networkName;
}) => {
  const supportedNetwork = getSupportedNetwork(network);

  if (!supportedNetwork) {
    throw new createError(400, ERROR_MESSAGE.NETWORK_UNSUPPORTED);
  }

  let provider: ethers.providers.Provider;

  if (network === "amoy") {
    try {
      // Attempt to use the primary provider
      const defaultProvider = supportedNetwork.provider();
      // Perform a synchronous check to validate the provider
      await defaultProvider.getNetwork(); // This throws if the provider is unreachable
      provider = defaultProvider;
    } catch (error) {
      // console.error("Primary provider failed for 'amoy', using backup provider:", error);
      // Use the backup provider for 'amoy'
      provider = new ethers.providers.JsonRpcProvider(
        "https://rpc-amoy.polygon.technology",
      );
    }
  } else {
    // For other networks, use the default provider
    provider = supportedNetwork.provider();
  }

  const verify = verificationBuilder(
    [...openAttestationVerifiers, openAttestationDidIdentityProof],
    { provider },
  );

  const fragments = await verify(document);

  if (!isValid(fragments)) {
    throw new createError(400, ERROR_MESSAGE.DOCUMENT_GENERIC_ERROR);
  }

  return fragments;
};

export const getEncryptedDocument = async ({
  str,
  existingKey,
}: {
  str: string;
  existingKey?: string;
}) => {
  const { key, ...encryptedDocument } = await encryptString(str, existingKey);

  return { encryptedDocument, encryptedDocumentKey: key };
};
