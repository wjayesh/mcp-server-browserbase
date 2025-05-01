import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools/definitions.js";
import { handleToolCall, setServerInstance } from "./tools/handlers.js";
import { handleListResources, handleReadResource } from "./resources/handlers.js";

// Server Setup and Configuration
const server = new Server(
  {
    name: "mcp-servers/playwright-browserbase",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {
        list: true,
        read: true,
      },
      tools: {
        list: true,
        call: true,
      },
      notifications: {
        resources: {
          list_changed: true,
        },
      },
    },
  },
);

// Inject server instance into tool handler module (for notifications)
setServerInstance(server);

// --- Request Handlers Setup ---

// List Resources
server.setRequestHandler(ListResourcesRequestSchema, handleListResources);

// Read Resource
server.setRequestHandler(ReadResourceRequestSchema, handleReadResource);

// List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Handling ListTools request.");
  return { tools: TOOLS };
});

// Call Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`Handling CallTool request for tool: ${request.params.name}`);
  // Delegate the actual tool execution to the handler function
  return handleToolCall(request.params.name, request.params.arguments ?? {});
});

// Server Initialization Function
export async function runServer() {
  try {
    console.error("Initializing server transport...");
    const transport = new StdioServerTransport();
    console.error("Connecting server...");
    await server.connect(transport);
    console.error("Playwright MCP server connected via stdio and ready.");
    // Optional pre-warming could be added here if needed,
    // possibly by calling ensureBrowserSession from sessionManager
  } catch (error) {
    console.error(
      `Failed to start or connect server: ${(error as Error).message}`,
    );
    process.exit(1); // Exit if server fails to start
  }
} 