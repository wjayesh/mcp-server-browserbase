#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeAllSessions } from "./sessionManager.js";
import { createServer } from "./server.js"; // Import the factory function
import { resolveConfig } from "./config.js";
import type { Tool } from "./tools/tool.js"; // Import Tool type
import type { Config } from "./config.js"; // Import Config type for potential filtering later

// Import tool module factory functions (using default imports)
import navigate from "./tools/navigate.js"; 
import snapshot from "./tools/snapshot.js"; // Bundles snapshot, screenshot, click, type
import keyboard from "./tools/keyboard.js";
import getText from "./tools/getText.js";
import session from "./tools/session.js";
import common from "./tools/common.js";
// Import placeholder factories
import drag from "./tools/drag.js";
import hover from "./tools/hover.js";
import selectOption from "./tools/selectOption.js";

// Import package.json for version (adjust path if needed)
// Note: Using require for JSON might be needed depending on tsconfig module resolution
// import packageJSON from '../package.json' assert { type: 'json' }; 
// Alternatively, define version manually for now if import causes issues
const serverVersion = "0.5.1"; // Manually set from package.json

async function main() {
    // Load configuration
    const config = resolveConfig();

    // --- Assemble the list of tools --- 
    // Call the factory functions to get the tool arrays
    // Rename to snapshotTools to reflect the interaction model
    const snapshotTools: Tool<any>[] = [
        ...common(true),
        ...keyboard(true),
        ...navigate(true),
        ...snapshot(true),
        ...getText(true),
        ...session(true),
    ];
    
    // TODO: Filter tools based on config.capabilities if needed
    const toolsToUse = snapshotTools; 

    // --- Create Server Instance using Factory --- 
    const server = createServer(
        { 
            name: "Browserbase",
            version: serverVersion,
            tools: toolsToUse 
        },
        config
    );

    // --- Setup Shutdown Handler --- 
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.error(`
Received ${signal}. Shutting down gracefully...`);
            try {
                await server.close(); 
            } catch (shutdownError) {
            }
          process.exit(0);
        });
});

    // --- Connect and Run Server --- 
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch (error) {
        process.exit(1);
    }
}

// Start the main function
main().catch((err) => {
    process.exit(1);
});

// Catch unhandled errors
process.on("uncaughtException", (err) => {
    process.exit(1);
});
