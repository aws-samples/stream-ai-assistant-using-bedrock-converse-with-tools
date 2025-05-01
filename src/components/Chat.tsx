import { Message } from "ai";
import { useChat } from "@ai-sdk/react";
import { fetchAuthSession } from "aws-amplify/auth";
import { CornerDownLeft, LoaderCircle, Paperclip } from "lucide-react";
import { ChangeEvent, useState } from "react";
import Markdown from "react-markdown";
import outputs from "../../amplify_outputs.json";
import { Settings } from "../App";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const chatUrl = `https://${outputs.custom.chatDistributionDomainName}`;

type Props = {
  settings: Settings;
};

export function Chat({ settings }: Props) {
  const [attachments, setAttachments] = useState<FileList>();

  const endpoint = settings.framework === "langchain" ? "/langchain" : "/ai";

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    addToolResult,
    status,
  } = useChat({
    api: chatUrl + endpoint,
    maxSteps: 5,
    body: { settings },

    // run client-side tools that are automatically executed
    async onToolCall({ toolCall }) {
      if (toolCall.toolName === "getLocation") {
        const cities = ["New York", "Los Angeles", "Chicago", "San Francisco"];
        return cities[Math.floor(Math.random() * cities.length)];
      }
    },
    // override fetch to include the headers
    async fetch(input, init) {
      const accessToken = (
        await fetchAuthSession()
      ).tokens?.accessToken.toString();

      if (!accessToken) {
        throw new Error("No access token");
      }

      const headers = new Headers(init?.headers);
      headers.set("X-Cognito-Token", accessToken);

      // Lambda does not support unsigned payloads
      // See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html#create-oac-overview-lambda
      const digestHex = await digestMessage(init?.body?.toString() || "");
      headers.append("X-Amz-Content-Sha256", digestHex);

      return fetch(input, { ...init, headers });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      setAttachments(undefined);
      return;
    }
    setAttachments(files);
  };

  let attachmentsText = "Attach Files";
  if (attachments) {
    const files = Array.from(attachments);
    attachmentsText = `${files.length} file${files.length > 1 ? "s" : ""}`;
  }

  return (
    <div className="relative flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-2 gap-4">
      <div className="flex-1 prose prose-neutral prose-sm max-w-none flex flex-col gap-4 [overflow-wrap:anywhere]">
        {messages?.map((m: Message) => (
          <div
            key={m.id}
            className={cn(
              "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 rounded-md px-3 py-2",
              m.role === "user"
                ? "bg-primary text-white self-end ml-4"
                : "bg-background text-black border self-start mr-4"
            )}
          >
            {m.role === "assistant" ? (
              <>
                {m.parts?.map((part) => {
                  if (part.type === "text") {
                    return <Markdown key={part.text}>{part.text}</Markdown>;
                  }
                  if (part.type === "tool-invocation") {
                    const toolInvocation = part.toolInvocation;
                    const toolCallId = toolInvocation.toolCallId;
                    const addResult = (result: string) =>
                      addToolResult({ toolCallId, result });

                    // render confirmation tool (client-side tool with user interaction)
                    if (toolInvocation.toolName === "askForConfirmation") {
                      return (
                        <div key={toolCallId}>
                          {toolInvocation.args.message}
                          <div className="flex gap-3 mt-4">
                            <Button
                              variant={
                                "result" in toolInvocation &&
                                toolInvocation.result === "Yes"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => addResult("Yes")}
                            >
                              Yes
                            </Button>
                            <Button
                              variant={
                                "result" in toolInvocation &&
                                toolInvocation.result === "No"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => addResult("No")}
                            >
                              No
                            </Button>
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })}
              </>
            ) : (
              m.content + (m.experimental_attachments ? " 📎" : "")
            )}
          </div>
        ))}
        {isLoading && <LoaderCircle className="animate-spin text-primary" />}
      </div>
      <form
        className="relative overflow-hidden rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
        onSubmit={(event) => {
          event.preventDefault();
          if (isLoading) {
            return;
          }
          handleSubmit(event, {
            experimental_attachments: attachments,
          });
          setAttachments(undefined);
        }}
      >
        <Label htmlFor="message" className="sr-only">
          Message
        </Label>
        <Textarea
          id="message"
          placeholder="Type your message here..."
          className="min-h-12 resize-none border-0 p-3 shadow-none focus-visible:ring-0"
          value={input}
          onChange={handleInputChange}
        />
        <div className="flex items-center p-3 pt-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={attachments ? "default" : "ghost"}
                size="icon"
                asChild
              >
                <Label className="cursor-pointer">
                  <Paperclip className="size-4" />
                  <span className="sr-only">{attachmentsText}</span>
                  <input
                    type="file"
                    name="attachments"
                    accept=".png, .jpg, .jpeg, .gif, .webp"
                    multiple
                    className="hidden"
                    onChange={handleAttachments}
                  />
                </Label>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{attachmentsText}</TooltipContent>
          </Tooltip>
          <Button
            type="submit"
            size="sm"
            className="ml-auto gap-1.5"
            disabled={isLoading}
          >
            Send Message
            <CornerDownLeft className="size-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

// See https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
async function digestMessage(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}
