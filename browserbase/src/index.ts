#!/usr/bin/env node

// Load environment variables early
import dotenv from "dotenv";
dotenv.config();

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Config } from "../config.js";
import type { Tool } from "./tools/tool.js";

import navigate from "./tools/navigate.js";
import snapshot from "./tools/snapshot.js";
import keyboard from "./tools/keyboard.js";
import getText from "./tools/getText.js";
import session from "./tools/session.js";
import common from "./tools/common.js";
import drag from "./tools/drag.js";
import hover from "./tools/hover.js";
import selectOption from "./tools/selectOption.js";
import contextTools from "./tools/context.js";
import cookies from "./tools/cookies.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Context } from "./context.js";

// Environment variables configuration
const requiredEnvVars = {
  BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
  BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
};

// Validate required environment variables
Object.entries(requiredEnvVars).forEach(([name, value]) => {
  if (!value) throw new Error(`${name} environment variable is required`);
});

// const serverVersion = "0.5.1";

export async function createServer(config: Config): Promise<Server> {  
  // Assume true for captureSnapshot for keyboard, adjust if needed
  const captureSnapshotFlag = true; 

    // Create the server
    const server = new Server(
    { name: "mcp-server-browserbase", version: "0.5.1" },
    {
      capabilities: {
        resources: { list: true, read: true },
        tools: { list: true, call: true },
        prompts: { list: true, get: true },
        notifications: { resources: { list_changed: true } },
      },
    }
  ); 

  // Create the context, passing server instance and config
  const context = new Context(server, config);

  const tools: Tool<any>[] = [
    ...common,
    ...snapshot,
    ...keyboard(captureSnapshotFlag), // Call the function and spread the result array
    // getText,    // Include the tool object directly
    // navigate,   // Include the tool object directly
    // session,    // Include the tool object directly
    ...getText,    // Spread the array exported by getText.ts
    ...navigate,   // Spread the array exported by navigate.ts
    session,       // Add the single tool object directly
    ...contextTools,
    ...cookies,
  ];

  const toolsMap = new Map(tools.map(tool => [tool.schema.name, tool]));
   // --- Setup Request Handlers ---

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: context.listResources() }; 
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const resourceContent = context.readResource(request.params.uri.toString());
      return { contents: [resourceContent] };
    } catch (error) {
      console.error(`Error reading resource via context: ${error}`);
      throw error;
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(tool => {
        let finalInputSchema;
        // Check if inputSchema is a Zod schema before converting
        if (tool.schema.inputSchema instanceof z.Schema) {
          // Add type assertion to help compiler
          finalInputSchema = zodToJsonSchema(tool.schema.inputSchema as any);
        } else if (typeof tool.schema.inputSchema === 'object' && tool.schema.inputSchema !== null) {
          // Assume it's already a valid JSON schema object
          finalInputSchema = tool.schema.inputSchema;
        } else {
          // Fallback or error handling if schema is neither
          console.error(`Warning: Tool '${tool.schema.name}' has an unexpected inputSchema type.`);
          finalInputSchema = { type: "object" }; // Default to empty object schema
        }
        
        return {
          name: tool.schema.name,
          description: tool.schema.description,
          inputSchema: finalInputSchema,
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const logError = (message: string) => {
      // Ensure error logs definitely go to stderr
      process.stderr.write(`[server.ts Error] ${new Date().toISOString()} ${message}\\n`);
    };

    const errorResult = (...messages: string[]) => {
      const result = {
        content: [{ type: 'text', text: messages.join('\\n') }],
        isError: true,
      };
      logError(`Returning error: ${JSON.stringify(result)}`); // Log the error structure
      return result;
    };

    // Use the map built from the passed-in tools
    const tool = toolsMap.get(request.params.name);

    if (!tool) {
      // Use the explicit error logger
      logError(`Tool "${request.params.name}" not found.`);
      // Check if it was a placeholder tool that wasn't implemented
      // This requires access to the original placeholder definitions,
      // maybe pass placeholder names/schemas separately or handle in Context?
      // For now, just return not found.
      return errorResult(`Tool "${request.params.name}" not found`);
    }

    try {
      // Delegate execution to the context
      const result = await context.run(tool, request.params.arguments ?? {});
      // Log the successful result structure just before returning
      process.stderr.write(`[server.ts Success] ${new Date().toISOString()} Returning result for ${request.params.name}: ${JSON.stringify(result)}\\n`);
      return result;
    } catch (error) {
      // Use the explicit error logger
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Error running tool ${request.params.name} via context: ${errorMessage}`);
      logError(`Original error stack (if available): ${error instanceof Error ? error.stack : 'N/A'}`); // Log stack trace
      return errorResult(`Failed to run tool '${request.params.name}': ${errorMessage}`);
    }
  });

  // Wrap server close to also close context
  const originalClose = server.close.bind(server);
  server.close = async () => {
    await context.close();
    await originalClose();
  };
  
  // Return the configured server instance, DO NOT connect here
  return server;
} 