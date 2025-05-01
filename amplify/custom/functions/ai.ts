import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { streamText } from "ai";
import { pipeline } from "stream";
import { promisify } from "util";
import { z } from "zod";

class UnauthorizedError extends Error {}
class BadRequestError extends Error {}

const headers = {
  "Content-Type": "text/plain; charset=utf-8",
};

const settingsSchema = z.object({
  model: z.string(),
  temperature: z.number(),
  system: z.string(),
});

const bedrock = createAmazonBedrock();

/**
 * AWS Lambda with Streaming Response.
 *
 * This functionality enables the AWS Lambda to send back a streaming response to the caller.
 * For more details, refer to the AWS documentation:
 * https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
 */
export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    try {
      let body;
      try {
        body = JSON.parse(event.body);
        settingsSchema.parse(body.settings);
      } catch (error) {
        console.error(error);
        throw new BadRequestError();
      }

      const { messages, settings } = body;

      let model = "anthropic.claude-3-5-sonnet-20240620-v1:0";

      if (settings.model === "claude-3-sonnet") {
        model = "anthropic.claude-3-sonnet-20240229-v1:0";
      }

      if (settings.model === "claude-3-haiku") {
        model = "anthropic.claude-3-haiku-20240307-v1:0";
      }

      // See https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-with-tool-calling#api-route
      const result = streamText({
        model: bedrock(model),
        temperature: settings.temperature,
        system: settings.system,
        messages,
        onError: (error) => {
          console.error(error);
        },
        tools: {
          // server-side tool with execute function
          getWeatherInformation: {
            description: "Show the weather in a given city to the user",
            parameters: z.object({ city: z.string() }),
            execute: async () => {
              const weatherOptions = [
                "sunny",
                "cloudy",
                "rainy",
                "snowy",
                "windy",
              ];
              return weatherOptions[
                Math.floor(Math.random() * weatherOptions.length)
              ];
            },
          },
          // client-side tool that starts user interaction
          askForConfirmation: {
            description: "Ask the user for confirmation.",
            parameters: z.object({
              message: z
                .string()
                .describe("The message to ask for confirmation."),
            }),
          },
          // client-side tool that is automatically executed on the client
          getLocation: {
            description:
              "Get the user location. Always ask for confirmation before using this tool.",
            parameters: z.object({
              consent: z
                .boolean()
                .describe("The user consent to use the location."),
            }),
          },
        },
      });

      const response = result.toDataStreamResponse();
      const responseBody = response.body;

      if (!responseBody) {
        throw new Error("No response body");
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Set the response status code and headers
      // See https://github.com/serverless/serverless/discussions/12090#discussioncomment-6685223
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: response.status,
        headers: responseHeaders,
      });

      await promisify(pipeline)(responseBody, responseStream);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        responseStream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: 401,
          headers,
        });
        responseStream.write("Unauthorized");
        responseStream.end();
      } else if (error instanceof BadRequestError) {
        responseStream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: 400,
          headers,
        });
        responseStream.write("Bad request");
        responseStream.end();
      } else {
        console.error(error);

        responseStream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: 500,
          headers,
        });
        responseStream.write("Internal server error");
        responseStream.end();
      }
    }
  }
);
