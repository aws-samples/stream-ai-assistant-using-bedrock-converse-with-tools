import { CognitoJwtVerifier } from "aws-jwt-verify";
import { CloudFrontRequestHandler } from "aws-lambda";

export const handler: CloudFrontRequestHandler = (event, _, callback) => {
  const request = event.Records[0].cf.request;

  // Authorize preflight requests
  if (request.method === "OPTIONS") {
    return callback(null, {
      status: "200",
      headers: {
        "access-control-allow-origin": [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
        "access-control-allow-methods": [
          { key: "Access-Control-Allow-Methods", value: "*" },
        ],
        "access-control-allow-headers": [
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type,X-Amz-Content-Sha256,X-Cognito-Token",
          },
        ],
      },
    });
  }

  const userPoolId =
    request.origin?.custom?.customHeaders?.["x-env-user-pool-id"]?.[0].value;
  const clientId =
    request.origin?.custom?.customHeaders?.["x-env-client-id"]?.[0].value;

  const accessToken = request.headers["x-cognito-token"]?.[0].value;

  if (!userPoolId || !clientId || !accessToken) {
    return callback(null, { status: "401" });
  }

  const verifier = CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: "access",
  });

  verifier
    .verify(accessToken)
    .then(() => {
      callback(null, request);
    })
    .catch(() => {
      callback(null, { status: "401" });
    });
};
