import { defineBackend } from "@aws-amplify/backend";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  CfnDistribution,
  CfnOriginAccessControl,
  Distribution,
  LambdaEdgeEventType,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import {
  FunctionUrlOrigin,
  S3StaticWebsiteOrigin,
} from "aws-cdk-lib/aws-cloudfront-origins";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import {
  Architecture,
  FunctionUrlAuthType,
  InvokeMode,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { fileURLToPath } from "node:url";
import { auth } from "./auth/resource";

const backend = defineBackend({ auth });

const customResourceStack = backend.createStack("MyCustomResources");

const bedrockPolicy = new PolicyStatement({
  actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  effect: Effect.ALLOW,
  resources: [
    `arn:aws:bedrock:${customResourceStack.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
    `arn:aws:bedrock:${customResourceStack.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
    `arn:aws:bedrock:${customResourceStack.region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`,
  ],
});

const aiFunction = new NodejsFunction(customResourceStack, "AiFunction", {
  entry: fileURLToPath(new URL("custom/functions/ai.ts", import.meta.url)),
  architecture: Architecture.ARM_64,
  runtime: Runtime.NODEJS_22_X,
  timeout: Duration.seconds(60),
  bundling: {
    externalModules: [],
  },
});

aiFunction.addToRolePolicy(bedrockPolicy);

const aiFunctionUrl = aiFunction.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM,
  invokeMode: InvokeMode.RESPONSE_STREAM,
});

aiFunctionUrl.grantInvokeUrl(
  new ServicePrincipal("cloudfront.amazonaws.com", {
    conditions: {
      StringEquals: {
        "aws:SourceAccount": customResourceStack.account,
      },
    },
  })
);

const langchainFunction = new NodejsFunction(
  customResourceStack,
  "LangchainFunction",
  {
    entry: fileURLToPath(
      new URL("custom/functions/langchain.ts", import.meta.url)
    ),
    architecture: Architecture.ARM_64,
    runtime: Runtime.NODEJS_22_X,
    timeout: Duration.seconds(60),
    bundling: {
      externalModules: [],
    },
  }
);

langchainFunction.addToRolePolicy(bedrockPolicy);

const langchainFunctionUrl = langchainFunction.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM,
  invokeMode: InvokeMode.RESPONSE_STREAM,
});

langchainFunctionUrl.grantInvokeUrl(
  new ServicePrincipal("cloudfront.amazonaws.com", {
    conditions: {
      StringEquals: {
        "aws:SourceAccount": customResourceStack.account,
      },
    },
  })
);

const chatBucket = new Bucket(customResourceStack, "ChatBucket", {
  removalPolicy: RemovalPolicy.DESTROY,
});

const authFunction = new NodejsFunction(customResourceStack, "AuthFunction", {
  entry: fileURLToPath(new URL("custom/functions/auth.ts", import.meta.url)),
  runtime: Runtime.NODEJS_22_X,
  bundling: {
    externalModules: [],
  },
});

// Protect functions behind CloudFront
// See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html#concept_lambda_function_url
const chatDistribution = new Distribution(
  customResourceStack,
  "ChatDistribution",
  {
    defaultBehavior: {
      origin: new S3StaticWebsiteOrigin(chatBucket, {
        customHeaders: {
          "X-Env-User-Pool-Id": backend.auth.resources.userPool.userPoolId,
          "X-Env-Client-Id":
            backend.auth.resources.userPoolClient.userPoolClientId,
        },
      }),
      edgeLambdas: [
        {
          functionVersion: authFunction.currentVersion,
          eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
        },
      ],
    },
    additionalBehaviors: {
      "/ai": {
        origin: new FunctionUrlOrigin(aiFunctionUrl, {
          customHeaders: {
            "X-Env-User-Pool-Id": backend.auth.resources.userPool.userPoolId,
            "X-Env-Client-Id":
              backend.auth.resources.userPoolClient.userPoolClientId,
          },
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy:
          ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
        edgeLambdas: [
          {
            functionVersion: authFunction.currentVersion,
            eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
          },
        ],
      },
      "/langchain": {
        origin: new FunctionUrlOrigin(langchainFunctionUrl, {
          customHeaders: {
            "X-Env-User-Pool-Id": backend.auth.resources.userPool.userPoolId,
            "X-Env-Client-Id":
              backend.auth.resources.userPoolClient.userPoolClientId,
          },
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy:
          ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
        edgeLambdas: [
          {
            functionVersion: authFunction.currentVersion,
            eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
          },
        ],
      },
    },
  }
);

// Create Origin Access Control for functions
// See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
const chatOriginAccessControl = new CfnOriginAccessControl(
  customResourceStack,
  "ChatOriginAccessControl",
  {
    originAccessControlConfig: {
      name: `chat-oac-${customResourceStack.node.addr}`,
      originAccessControlOriginType: "lambda",
      signingBehavior: "always",
      signingProtocol: "sigv4",
    },
  }
);

// Add Access Control to origins
// See https://github.com/aws/aws-cdk/issues/26405
(chatDistribution.node.defaultChild as CfnDistribution).addPropertyOverride(
  "DistributionConfig.Origins.1.OriginAccessControlId",
  chatOriginAccessControl.getAtt("Id")
);
(chatDistribution.node.defaultChild as CfnDistribution).addPropertyOverride(
  "DistributionConfig.Origins.2.OriginAccessControlId",
  chatOriginAccessControl.getAtt("Id")
);

backend.addOutput({
  custom: {
    chatDistributionDomainName: chatDistribution.distributionDomainName,
  },
});
