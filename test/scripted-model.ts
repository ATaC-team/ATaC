import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export function scriptedContext(
  reply: (n: number, context: TranscriptContext) => AssistantMessage["content"],
  ready: Promise<void> = Promise.resolve(),
) {
  let requests = 0;
  const notices: { message: string; type: string }[] = [];
  const widgets: (string[] | undefined)[] = [];
  const provider = {
    baseUrl: "http://unused.invalid",
    apiKey: "fixture-key",
    api: "openai-completions",
    models: [
      {
        id: "test-model",
        name: "Test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 2000,
      },
    ],
    streamSimple: (_model: unknown, context: TranscriptContext) => {
      const content = reply(++requests, context);
      const message: AssistantMessage = {
        role: "assistant",
        api: "openai-completions",
        provider: "atac-fixture",
        model: "test-model",
        timestamp: Date.now(),
        stopReason: content.some((c) => c.type === "toolCall")
          ? "toolUse"
          : "stop",
        content,
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const stream = createAssistantMessageEventStream();
      void ready.then(() => {
        stream.push({ type: "start", partial: message });
        stream.push({
          type: "done",
          reason: message.stopReason as "stop" | "toolUse",
          message,
        });
        stream.end();
      });
      return stream;
    },
  };
  return {
    notices,
    widgets,
    ctx: {
      hasUI: true,
      mode: "rpc",
      ui: {
        setWidget: (_key: string, lines: string[] | undefined) =>
          widgets.push(lines),
        notify: (message: string, type: string) =>
          notices.push({ message, type }),
      },
      model: { provider: "atac-fixture", id: "test-model" },
      modelRegistry: {
        getRegisteredNativeProvider: () => undefined,
        getRegisteredProviderConfig: () => provider,
      },
    } as unknown as ExtensionContext,
    requests: () => requests,
  };
}
