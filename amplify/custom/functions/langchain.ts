import { ChatBedrockConverse } from "@langchain/aws";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  MessageContent,
} from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { LangChainAdapter, Message } from "ai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
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

const tools = [
  tool(({ city }) => `The weather in ${city} is sunny`, {
    name: "weather_tool",
    description: "Get the weather for a city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }),
];

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

      const prompt = ChatPromptTemplate.fromMessages([
        ["system", settings.system],
        ["placeholder", "{chat_history}"],
        ["placeholder", "{agent_scratchpad}"],
      ]);

      // See https://v03.api.js.langchain.com/classes/_langchain_aws.ChatBedrockConverse.html
      const llm = new ChatBedrockConverse({
        model,
        temperature: settings.temperature,
      });

      // See https://v03.api.js.langchain.com/functions/langchain.agents.createToolCallingAgent.html
      const agent = createToolCallingAgent({ llm, tools, prompt });

      const agentExecutor = new AgentExecutor({ agent, tools });

      // Convert the messages to the format expected by LangChain
      const langchainMessages = messages.map((message: Message) => {
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
      });

      const agentStream = agentExecutor.streamEvents(
        { chat_history: langchainMessages },
        { version: "v2" }
      );

      // See https://github.com/vercel/ai/issues/1791#issuecomment-2238397610
      const stream = new ReadableStream({
        async pull(controller) {
          for await (const { event, data } of agentStream) {
            if (event === "on_chat_model_stream") {
              const msg = data?.chunk as AIMessageChunk;

              if ((msg.tool_call_chunks?.length ?? 0) > 0) {
                console.log("Tool calls", msg.tool_calls);
              } else if (msg.content) {
                controller.enqueue(msg.content as string);
              }
            }
          }
          controller.close();
        },
      });

      const response = LangChainAdapter.toDataStreamResponse(stream);
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
