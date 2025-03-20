#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { Browserbase } from "@browserbasehq/sdk";

// Environment variables configuration
const requiredEnvVars = {
  BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
  BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
};

// Validate required environment variables
Object.entries(requiredEnvVars).forEach(([name, value]) => {
  if (!value) throw new Error(`${name} environment variable is required`);
});

// 2. Global State
const browsers = new Map<string, { browser: Browser; page: Page }>();
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();
// Global state variable for the default browser session
let defaultBrowserSession: { browser: Browser; page: Page } | null = null;
const sessionId = "default"; // Using a consistent session ID for the default session

// Flag to track if the server is fully initialized
let serverInitialized = false;

// Ensure browser session is initialized and valid
async function ensureBrowserSession(): Promise<{
  browser: Browser;
  page: Page;
}> {
  try {
    // If no session exists, create one
    if (!defaultBrowserSession) {
      log("Initializing new browser session...", "info");
      defaultBrowserSession = await createNewBrowserSession(sessionId);
      return defaultBrowserSession;
    }

    // Try to perform a simple operation to check if the session is still valid
    try {
      await defaultBrowserSession.page.evaluate(() => document.title);
      return defaultBrowserSession;
    } catch (error) {
      // If we get an error indicating the session is invalid, reinitialize
      if (
        error instanceof Error &&
        (error.message.includes(
          "Target page, context or browser has been closed"
        ) ||
          error.message.includes("Session expired") ||
          error.message.includes("context destroyed") ||
          error.message.includes("Protocol error") ||
          error.message.includes("detached") ||
          error.message.includes("Attempted to use detached Frame"))
      ) {
        log(
          "Browser session expired or detached, attempting full reset...",
          "info"
        );
        // Force cleanup of all sessions
        try {
          // Try to close the session if it's still accessible
          if (defaultBrowserSession) {
            try {
              await defaultBrowserSession.browser.close();
            } catch (e) {
              // Ignore errors when closing an already closed browser
            }
          }
          // Clean up all existing browser sessions
          for (const [id, sessionObj] of browsers.entries()) {
            try {
              await sessionObj.browser.close();
            } catch {
              // Ignore errors when closing
            }
            browsers.delete(id);
          }
        } catch (e) {
          log(
            `Error during cleanup: ${
              e instanceof Error ? e.message : String(e)
            }`,
            "error"
          );
          // Continue with reset even if cleanup fails
        }

        // Reset state
        browsers.clear();
        defaultBrowserSession = null;

        // Create a completely new session with delay to allow system to clean up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        log("Creating fresh browser session after reset...", "info");
        defaultBrowserSession = await createNewBrowserSession(sessionId);
        return defaultBrowserSession;
      }
      throw error; // Re-throw if it's a different type of error
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(
      `Failed to initialize/reinitialize browser session: ${errorMsg}`,
      "error"
    );

    // If we still have a detached frame error after the first attempt, try a more aggressive approach
    if (
      errorMsg.includes("detached") ||
      errorMsg.includes("Attempted to use detached Frame")
    ) {
      log(
        "Detached frame error persists, trying with a clean Browserbase connection...",
        "info"
      );
      try {
        // Force cleanup
        browsers.clear();
        defaultBrowserSession = null;

        // Wait a bit longer to ensure resources are released
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Create a completely fresh connection
        defaultBrowserSession = await createNewBrowserSession(
          `fresh_${Date.now()}`
        );
        return defaultBrowserSession;
      } catch (retryError) {
        const retryErrorMsg =
          retryError instanceof Error ? retryError.message : String(retryError);
        log(`Failed second attempt: ${retryErrorMsg}`, "error");
        throw retryError;
      }
    }
    throw error;
  }
}

// Helper function for logging
function log(message: string, level: "info" | "error" | "debug" = "info") {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  consoleLogs.push(logMessage);

  // Console output
  console[level === "error" ? "error" : "log"](logMessage);

  // Only send notification if server is initialized
  if (server && serverInitialized) {
    server.notification({
      method: "notifications/cloud/message",
      params: { message: logMessage, type: level },
    });
  }
}

// 3. Helper Functions
async function createNewBrowserSession(sessionId: string) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });

  const browser = await puppeteer.connect({
    browserWSEndpoint: session.connectUrl,
  });

  const page = (await browser.pages())[0];
  browsers.set(sessionId, { browser, page });

  // Set up console logging for this session
  page.on("console", (msg) => {
    const logEntry = `[Session ${sessionId}][${msg.type()}] ${msg.text()}`;
    consoleLogs.push(logEntry);
    server.notification({
      method: "notifications/cloud/message",
      params: { message: logEntry, type: "console_log" },
    });
  });

  return { browser, page };
}

// 4. Tool Definitions
const TOOLS: Tool[] = [
  {
    name: "browserbase_create_session",
    description: "Create a new cloud browser session using Browserbase",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browserbase_navigate",
    description: "Navigate to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
  },
  {
    name: "browserbase_screenshot",
    description:
      "Takes a screenshot of the current page. Use this tool to learn where you are on the page when controlling the browser. Use this tool when the other tools are not sufficient enough to get the information you need.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for element to screenshot (optional)",
        },
        width: {
          type: "number",
          description: "Width in pixels (default: 800)",
        },
        height: {
          type: "number",
          description: "Height in pixels (default: 600)",
        },
      },
      required: [],
    },
  },
  {
    name: "browserbase_click",
    description: "Click an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for element to click",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browserbase_fill",
    description: "Fill out an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for input field",
        },
        value: { type: "string", description: "Value to fill" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "browserbase_evaluate",
    description: "Execute JavaScript in the browser console",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["script"],
    },
  },
  {
    name: "browserbase_get_content",
    description: "Extract all content from the current page",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS selector to get content from specific elements (default: returns whole page). Only use this tool when explicitly asked to extract content from a specific page.",
        },
      },
      required: [],
    },
  },
];

// 5. Tool Handler Implementation
async function handleToolCall(
  name: string,
  args: any
): Promise<CallToolResult> {
  try {
    // Declare session at function level
    let session: { browser: Browser; page: Page } | undefined;

    // For tools that don't need a session, skip session check
    if (!["browserbase_create_session"].includes(name)) {
      // Check if a specific session ID is requested
      if (args.sessionId && args.sessionId !== sessionId) {
        // Check if the requested session exists
        if (!browsers.has(args.sessionId)) {
          return {
            content: [
              {
                type: "text",
                text: `Session with ID '${args.sessionId}' does not exist. Please create a session first.`,
              },
            ],
            isError: true,
          };
        }
        // Use the specified session
        session = browsers.get(args.sessionId);
      } else {
        // Use or create the default session
        session = await ensureBrowserSession();
      }
    }

    switch (name) {
      case "browserbase_create_session":
        try {
          // Create or verify the default session
          await ensureBrowserSession();
          return {
            content: [
              {
                type: "text",
                text: "Browser session is ready",
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create browser session: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_navigate":
        await session!.page.goto(args.url);
        return {
          content: [
            {
              type: "text",
              text: `Navigated to ${args.url}`,
            },
          ],
          isError: false,
        };
      case "browserbase_screenshot":
        try {
          const width = args.width ?? 800;
          const height = args.height ?? 600;
          await session!.page.setViewport({ width, height });

          // Take screenshot
          const screenshotBase64 = await (args.selector
            ? (
                await session!.page.$(args.selector)
              )?.screenshot({ encoding: "base64" })
            : session!.page.screenshot({
                encoding: "base64",
                fullPage: false,
              }));

          if (!screenshotBase64) {
            return {
              content: [
                {
                  type: "text",
                  text: args.selector
                    ? `Element not found: ${args.selector}`
                    : "Screenshot failed",
                },
              ],
              isError: true,
            };
          }

          // Store screenshot
          const name = `screenshot-${new Date()
            .toISOString()
            .replace(/:/g, "-")}`;
          screenshots.set(name, screenshotBase64 as string);

          // Notify client that resources list has changed
          server.notification({
            method: "notifications/resources/list_changed",
          });

          return {
            content: [
              {
                type: "text",
                text: `Screenshot taken with name: ${name}`,
              },
              {
                type: "image",
                data: screenshotBase64,
                mimeType: "image/png",
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          log(`Failed to take screenshot: ${errorMsg}`, "error");
          return {
            content: [
              {
                type: "text",
                text: `Failed to take screenshot: ${errorMsg}`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_click":
        try {
          await session!.page.click(args.selector);
          return {
            content: [
              {
                type: "text",
                text: `Clicked: ${args.selector}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to click ${args.selector}: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_fill":
        try {
          await session!.page.waitForSelector(args.selector);
          await session!.page.type(args.selector, args.value);
          return {
            content: [
              {
                type: "text",
                text: `Filled ${args.selector} with: ${args.value}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fill ${args.selector}: ${
                  (error as Error).message
                }`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_evaluate":
        try {
          const result = await session!.page.evaluate((script) => {
            const logs: string[] = [];
            const originalConsole = { ...console };
            ["log", "info", "warn", "error"].forEach((method) => {
              (console as any)[method] = (...args: any[]) => {
                logs.push(`[${method}] ${args.join(" ")}`);
                (originalConsole as any)[method](...args);
              };
            });
            try {
              const result = eval(script);
              Object.assign(console, originalConsole);
              return { result, logs };
            } catch (error) {
              Object.assign(console, originalConsole);
              throw error;
            }
          }, args.script);
          return {
            content: [
              {
                type: "text",
                text: `Execution result:\n${JSON.stringify(
                  result.result,
                  null,
                  2
                )}\n\nConsole output:\n${result.logs.join("\n")}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Script execution failed: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_get_json":
        try {
          const result = await session!.page.evaluate((selector) => {
            // Helper function to find JSON in text
            function extractJSON(text: string) {
              const jsonObjects = [];
              let braceCount = 0;
              let start = -1;
              for (let i = 0; i < text.length; i++) {
                if (text[i] === "{") {
                  if (braceCount === 0) start = i;
                  braceCount++;
                } else if (text[i] === "}") {
                  braceCount--;
                  if (braceCount === 0 && start !== -1) {
                    try {
                      const jsonStr = text.slice(start, i + 1);
                      const parsed = JSON.parse(jsonStr);
                      jsonObjects.push(parsed);
                    } catch (e) {
                      // Invalid JSON, continue searching
                    }
                  }
                }
              }
              return jsonObjects;
            }

            // Get all text content based on selector or full page
            const elements = selector
              ? Array.from(document.querySelectorAll(selector))
              : [document.body];
            const results = {
              // Look for JSON in text content
              textContent: elements.flatMap((el) =>
                extractJSON(el.textContent || "")
              ),
              // Look for JSON in script tags
              scriptTags: Array.from(
                document.getElementsByTagName("script")
              ).flatMap((script) => {
                try {
                  if (script.type === "application/json") {
                    return [JSON.parse(script.textContent || "")];
                  }
                  return extractJSON(script.textContent || "");
                } catch (e) {
                  return [];
                }
              }),
              // Look for JSON in meta tags
              metaTags: Array.from(
                document.getElementsByTagName("meta")
              ).flatMap((meta) => {
                try {
                  const content = meta.getAttribute("content") || "";
                  return extractJSON(content);
                } catch (e) {
                  return [];
                }
              }),
              // Look for JSON-LD
              jsonLd: Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
              ).flatMap((script) => {
                try {
                  return [JSON.parse(script.textContent || "")];
                } catch (e) {
                  return [];
                }
              }),
            };
            return results;
          }, args.selector);
          return {
            content: [
              {
                type: "text",
                text: `Found JSON content:\n${JSON.stringify(result, null, 2)}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to extract JSON: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      case "browserbase_get_content":
        try {
          let content;
          if (args.selector) {
            // If selector is provided, get content from specific elements
            content = await session!.page.evaluate((selector) => {
              const elements = document.querySelectorAll(selector);
              return Array.from(elements).map((el) => el.textContent || "");
            }, args.selector);
          } else {
            // If no selector is provided, get content from the whole page
            content = await session!.page.evaluate(() => {
              return Array.from(document.querySelectorAll("*")).map(
                (el) => el.textContent || ""
              );
            });
          }
          return {
            content: [
              {
                type: "text",
                text: `Extracted content:\n${JSON.stringify(content, null, 2)}`,
              },
            ],
            isError: false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to extract content: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Failed to handle tool call: ${errorMsg}`, "error");
    return {
      content: [
        {
          type: "text",
          text: `Failed to handle tool call: ${errorMsg}`,
        },
      ],
      isError: true,
    };
  }
}

// Add this helper function
function sanitizeJSON(data: any): any {
  try {
    // If it's already a string, validate it
    if (typeof data === "string") {
      return JSON.stringify(JSON.parse(data));
    }
    // Otherwise stringify the object
    return JSON.stringify(data);
  } catch (error) {
    console.error("JSON sanitization error:", error);
    // Return a safe error response
    return JSON.stringify({
      error: {
        code: -32700,
        message: "Parse error",
      },
    });
  }
}

// 6. Server Setup and Configuration
const server = new Server(
  {
    name: "example-servers/browserbase",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// 7. Request Handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const resources = {
      resources: [
        {
          uri: "console://logs",
          mimeType: "text/plain",
          name: "Browser console logs",
        },
        ...Array.from(screenshots.keys()).map((name) => ({
          uri: `screenshot://${name}`,
          mimeType: "image/png",
          name: `Screenshot: ${name}`,
        })),
      ],
    };

    // Sanitize before returning
    return JSON.parse(sanitizeJSON(resources));
  } catch (error) {
    log(
      `Error in ListResourcesRequestSchema: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "error"
    );
    return {
      resources: [], // Always return valid structure
    };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    const uri = request.params.uri.toString();
    if (uri === "console://logs") {
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: consoleLogs.join("\n"),
          },
        ],
      };
    }

    if (uri.startsWith("screenshot://")) {
      const name = uri.split("://")[1];
      const screenshot = screenshots.get(name);
      if (screenshot) {
        return {
          contents: [
            {
              uri,
              mimeType: "image/png",
              blob: screenshot,
            },
          ],
        };
      }
    }

    throw new Error(`Resource not found: ${uri}`);
  } catch (error) {
    log(
      `Error in ReadResourceRequestSchema: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "error"
    );
    return {
      error: {
        code: -32603,
        message: `Internal error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

// 8. Server Initialization
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  serverInitialized = true;
}

runServer().catch(console.error);
