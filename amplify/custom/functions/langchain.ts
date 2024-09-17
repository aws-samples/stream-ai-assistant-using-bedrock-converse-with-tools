import { ChatBedrockConverse } from "@langchain/aws";
import {
  AIMessage,
  HumanMessage,
  MessageContent,
  SystemMessage,
} from "@langchain/core/messages";
import { LangChainAdapter, Message } from "ai";
import { pipeline, Readable } from "stream";
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

      // See https://js.langchain.com/v0.2/docs/integrations/chat/bedrock_converse/
      const llm = new ChatBedrockConverse({
        model,
        temperature: settings.temperature,
      });

      const allMessages = [
        new SystemMessage(settings.system),
        ...messages.map((message: Message) => {
          if (message.role === "user") {
            const messageWithAttachments: MessageContent = [
              { type: "text", text: message.content },
            ];

            if (message.experimental_attachments) {
              for (const attachment of message.experimental_attachments) {
                messageWithAttachments.push({
                  type: "image_url",
                  image_url: { url: attachment.url },
                });
              }
            }

            return new HumanMessage({
              content: messageWithAttachments,
            });
          }

          return new AIMessage(message.content);
        }),
      ];

      const stream = await llm.stream(allMessages);

      // Set the response status code and headers
      // See https://github.com/serverless/serverless/discussions/12090#discussioncomment-6685223
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers,
      });

      const requestStream = Readable.from(
        LangChainAdapter.toDataStream(stream)
      );

      await promisify(pipeline)(requestStream, responseStream);
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
