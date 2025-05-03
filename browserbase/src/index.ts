#!/usr/bin/env node

// Load environment variables early
import dotenv from "dotenv";
dotenv.config();

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { resolveConfig, type CLIOptions } from "./config.js";
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

// Environment variables configuration
const requiredEnvVars = {
  BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
  BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
};

// Validate required environment variables
Object.entries(requiredEnvVars).forEach(([name, value]) => {
  if (!value) throw new Error(`${name} environment variable is required`);
});

const serverVersion = "0.5.1";

async function main() {
  const cliOptions: CLIOptions = {};
  const config = await resolveConfig(cliOptions);

  // Assume true for captureSnapshot for keyboard, adjust if needed
  const captureSnapshotFlag = true; 

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
  ];

  const toolsToUse = tools;

  const server = createServer(
    {
      name: "Browserbase",
      version: serverVersion,
      tools: toolsToUse,
    },
    config
  );

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.error(`
Received ${signal}. Shutting down gracefully...`);
      try {
        await server.close();
        console.error("Server closed.");
      } catch (shutdownError) {
        console.error("Error during shutdown:", shutdownError);
      } finally {
        process.exit(0);
      }
    });
  });

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Browserbase MCP server connected via stdio.");
  } catch (error) {
    console.error("Failed to connect server:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Unhandled exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
