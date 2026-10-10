import { createInterface } from "node:readline";
const input = createInterface({ input: process.stdin });
input.on("line", async (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result;
  if (request.method === "initialize")
    result = {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "atac-test", version: "1" },
    };
  else if (request.method === "tools/list") {
    if (process.argv[2])
      await new Promise((resolve) =>
        setTimeout(resolve, Number(process.argv[2])),
      );
    result = {
      tools: [
        {
          name: "double",
          description: "Double a number",
          inputSchema: {
            type: "object",
            properties: { n: { type: "number" } },
            required: ["n"],
          },
          outputSchema: {
            type: "object",
            properties: { n: { type: "number" } },
            required: ["n"],
          },
        },
      ],
    };
  } else if (request.method === "tools/call")
    result = {
      content: [{ type: "text", text: "doubled" }],
      structuredContent: { n: request.params.arguments.n * 2 },
    };
  else result = {};
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n",
  );
});
