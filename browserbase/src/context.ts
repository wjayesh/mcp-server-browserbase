import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { BrowserSession } from "./sessionManager.js";
import {
  getSession,
  defaultSessionId,
  closeAllSessions,
} from "./sessionManager.js";
import type { Tool, ToolContext } from "./tools/tool.js";
import type { Config } from "./config.js";
import {
  Resource,
  CallToolResult,
  TextContent,
  ImageContent,
  ResourceListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Define ToolActionResult locally if not exported
// import type { Tool, ToolContext, ToolActionResult } from "./tools/tool.js"; // Assuming ToolActionResult is here
export type ToolActionResult =
  | { content?: (ImageContent | TextContent)[] }
  | undefined
  | void;

/**
 * Manages the context for tool execution within a specific Browserbase session.
 *
 * Role Analogy:
 * This class holds session-specific state (like latest snapshots, resources)
 * and provides access to the active page/browser for the current session.
 * This is somewhat analogous to the role of the `Tab` class in the Playwright
 * MCP example, which encapsulates state for a single page.
 *
 * Differences from Playwright MCP Context Example:
 * - Browser Lifecycle: This Context does NOT manage the browser launch/
 *   connection lifecycle; that is handled by `sessionManager` (sessionManager.ts) interacting
 *   with the Browserbase API.
 * - Tab Management: This Context focuses on a single active session determined
 *   by `currentSessionId`, unlike the Playwright example which explicitly
 *   manages an array of `Tab` objects.
 * - Execution Model: This Context uses a `run`/`CallToolResult` pattern. Its `run`
 *   method calls `tool.run`, which performs the action and returns the final
 *   result structure. The Playwright example uses a `handle`/`ToolActionResult`
 *   pattern where the Context interprets the result to perform actions.
 */
export class Context {
  private server: Server;
  private config: Config;
  public currentSessionId: string = defaultSessionId;
  private screenshots = new Map<string, string>();
  private latestSnapshots = new Map<string, any>();
  private screenshotResources = new Map<
    string,
    { format: string; bytes: string; uri: string }
  >();

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
    this.screenshotResources = new Map();
  }

  // --- Public Getter for Config ---
  public getConfig(): Config {
    return this.config;
  }

  // --- Snapshot State Handling ---

  getLatestSnapshot(sessionId: string): any | undefined {
    return this.latestSnapshots.get(sessionId);
  }

  setLatestSnapshot(sessionId: string, snapshot: any): void {
    this.latestSnapshots.set(sessionId, snapshot);
  }

  clearLatestSnapshot(sessionId: string): void {
    this.latestSnapshots.delete(sessionId);
  }

  // --- Resource Handling Methods ---

  listResources(): Resource[] {
    const resources: Resource[] = [];
    for (const [name, data] of this.screenshotResources.entries()) {
      resources.push({
        uri: data.uri,
        mimeType: data.format,
        name: `Screenshot: ${name}`,
      });
    }
    return resources;
  }

  readResource(uri: string): { uri: string; mimeType: string; blob: string } {
    const prefix = "mcp://screenshots/";
    if (uri.startsWith(prefix)) {
      const name = uri.split("/").pop() || "";
      const data = this.screenshotResources.get(name);
      if (data) {
        return {
          uri,
          mimeType: data.format,
          blob: data.bytes,
        };
      } else {
        throw new Error(`Screenshot resource not found: ${name}`);
      }
    } else {
      throw new Error(`Resource URI format not recognized: ${uri}`);
    }
  }

  addScreenshot(name: string, format: "png" | "jpeg", bytes: string): void {
    const uri = `mcp://screenshots/${name}`;
    this.screenshotResources.set(name, { format, bytes, uri });
    this.server.notification({
      method: "resources/list_changed",
      params: {},
    });
  }

  // --- Session and Tool Execution ---

  public async getActivePage(): Promise<BrowserSession["page"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || session.page.isClosed()) {
      return null;
    }
    return session.page;
  }

  public async getActiveBrowser(): Promise<BrowserSession["browser"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || !session.browser.isConnected()) {
      return null;
    }
    return session.browser;
  }

  // Add a simple timeout method
  public async waitForTimeout(timeoutMillis: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, timeoutMillis));
  }

  // Define helper for creating error results if not imported
  private createErrorResult(message: string, toolName: string): CallToolResult {
    console.error(`[${toolName}] Error: ${message}`);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }

  async run(tool: Tool<any>, args: any): Promise<CallToolResult> {
    const toolName = tool.schema.name;
    let initialPage: BrowserSession["page"] | null = null;
    let initialBrowser: BrowserSession["browser"] | null = null;

    console.error(`[Context.run] Executing tool: ${toolName}`); // Log tool name TO STDERR
    console.error(`[Context.run] Received args:`, JSON.stringify(args, null, 2)); // Log raw args TO STDERR

    // Validate args first
    let validatedArgs: any;
    try {
      validatedArgs = tool.schema.inputSchema.parse(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMsg = error.issues.map((issue) => issue.message).join(", ");
        return this.createErrorResult(
          `Input validation failed: ${errorMsg}`,
          toolName
        );
      }
      return this.createErrorResult(
        `Input validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        toolName
      );
    }

    // --- Session Handling ---
    // Check if the validated arguments contain a sessionId
    if (validatedArgs && typeof validatedArgs.sessionId === 'string' && validatedArgs.sessionId) {
      // If a specific sessionId is provided, switch the context's current session ID
      console.error(`[Context.run] Found sessionId in args: ${validatedArgs.sessionId}. Switching active session.`); // Log explicit session switch TO STDERR
      this.currentSessionId = validatedArgs.sessionId;
    } else if (toolName === 'browserbase_session_create') {
        // Special case: Skip retrieval before creation
        console.error(`[Context.run] Tool is ${toolName}. Skipping session retrieval.`);
    } else {
        // Use the implicitly active session ID (this.currentSessionId)
        console.error(`[Context.run] PRE-GET: About to use active session ID: ${this.currentSessionId}`); 
        console.error(`[Context.run] Using active session ID: ${this.currentSessionId}`); // <--- Uses the (potentially updated) ID
    }

    // Get page/browser *after* potentially switching session ID
    if (toolName !== "browserbase_session_create") {
      try {
        console.error(`[Context.run] GETSESSION CALL: Calling getSession with ID: ${this.currentSessionId}`);
        console.error(`[Context.run] Attempting to get session: ${this.currentSessionId}`); // <--- Uses the correct ID here
        const session = await getSession(this.currentSessionId, this.config); // <--- Passes the correct ID to sessionManager
        if (!session || session.page.isClosed() || !session.browser.isConnected()) {
           console.error(`[Context.run] Session ${this.currentSessionId} is invalid or closed.`);
           throw new Error(`Session ${this.currentSessionId} is invalid or closed.`);
        }
        initialPage = session.page;
        initialBrowser = session.browser;
        console.error(`[Context.run] Successfully retrieved session with ID: "${this.currentSessionId}", browser connected: ${initialBrowser.isConnected()}, page URL: ${initialPage.url()}`);
      } catch (sessionError) {
          // Catch errors during getSession or validity checks
          console.error(`[Context.run] Error retrieving/validating session ${this.currentSessionId}: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`); // Log session error TO STDERR
          return this.createErrorResult(
              `Error retrieving or validating session ${this.currentSessionId}: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`,
              toolName
          );
      }
    }

    // --- Execute Tool Logic ---
    let finalResult: CallToolResult;

    // Prioritize executing Playwright action directly if it's a browser interaction tool
    // Assumes the tool schemas provide necessary parameters like 'selector', 'url', 'text', 'values' etc.

    try {
        // --- Direct Playwright Action Execution ---
        switch (toolName) {
            case 'browserbase_navigate': // Assuming a tool name, adjust if needed
                if (!initialPage) throw new Error("Page not available for navigation.");
                if (typeof validatedArgs.url !== 'string') throw new Error("Missing 'url' argument for navigate.");
                await initialPage.goto(validatedArgs.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                finalResult = { content: [{ type: 'text', text: `Navigated to ${validatedArgs.url}` }], isError: false };
                break;

            case 'browserbase_click':
                 if (!initialPage) throw new Error("Page not available for click.");
                 if (typeof validatedArgs.ref !== 'string') throw new Error("Missing 'ref' argument for click.");
                 if (typeof validatedArgs.element !== 'string') throw new Error("Missing 'element' argument for click.");

                 try {
                     // 1. Delegate to the tool's handle function
                     const clickToolResult = await tool.handle(this as any, validatedArgs);

                     let actionResultText = `Clicked element: ${validatedArgs.element} (ref: ${validatedArgs.ref})`; // Default success text

                     // 2. Check if an action function was returned
                     if (clickToolResult && typeof clickToolResult.action === 'function') {
                         // 3. Await the action's execution
                         const actionResult = await clickToolResult.action();

                         // 4. Optionally use text from the action's result
                         if (actionResult?.content?.length) {
                             actionResultText = actionResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
                         }
                         // If actionResult is void/undefined or has no content, the default success text is used.
                         
                         // 5. Construct the final success result (only if action was executed)
                         finalResult = {
                             content: [{ type: 'text', text: actionResultText }],
                             isError: false
                         };
                     } else {
                         // If handle didn't return an action, treat it as an error for interactive tools.
                         finalResult = this.createErrorResult(
                             `Tool ${toolName} handle did not return an executable action.`,
                             toolName
                         );
                     }

                 } catch (clickError) {
                     // 6. Catch errors specifically from handle() or action()
                     finalResult = this.createErrorResult(
                         `Click action failed for ${validatedArgs.element} (ref: ${validatedArgs.ref}): ${clickError instanceof Error ? clickError.message : String(clickError)}`,
                         toolName
                     );
                 }
                 break; // End of browserbase_click case

            case 'browserbase_type': // Renamed from 'fill' for clarity, or handle both
                 if (!initialPage) throw new Error("Page not available for type.");
                 // Align with snapshot.ts definition: expect 'ref', 'element', 'text', etc.
                 if (typeof validatedArgs.ref !== 'string') throw new Error("Missing 'ref' argument for type.");
                 if (typeof validatedArgs.element !== 'string') throw new Error("Missing 'element' argument for type.");
                 if (typeof validatedArgs.text !== 'string') throw new Error("Missing 'text' argument for type.");

                 // Delegate to the tool's handle function
                 const typeToolResult = await tool.handle(this as any, validatedArgs);

                 // Construct result message based on delegation
                 let typeContent = `Type action delegated for element: ${validatedArgs.element} (ref: ${validatedArgs.ref})`;
                 if (typeToolResult && typeToolResult.action) {
                     const actionResult = await typeToolResult.action();
                     if (actionResult?.content?.length) {
                         const actionText = actionResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
                         typeContent = actionText;
                     }
                     // Construct success result only if action was executed
                     finalResult = { content: [{ type: 'text', text: typeContent }], isError: false };
                 } else {
                     // If handle didn't return an action, treat it as an error.
                     finalResult = this.createErrorResult(
                         `Tool ${toolName} handle did not return an executable action.`,
                         toolName
                     );
                 }
                 break;

             case 'browserbase_select_option':
                 if (!initialPage) throw new Error("Page not available for select_option.");
                 // Align with snapshot.ts definition: expect 'ref', 'element', 'values'
                 if (typeof validatedArgs.ref !== 'string') throw new Error("Missing 'ref' argument for select_option.");
                 if (typeof validatedArgs.element !== 'string') throw new Error("Missing 'element' argument for select_option.");
                 if (!Array.isArray(validatedArgs.values) || validatedArgs.values.length === 0) throw new Error("Missing or empty 'values' array for select_option.");

                 // Delegate to the tool's handle function
                 const selectToolResult = await tool.handle(this as any, validatedArgs);

                 // Construct result message based on delegation
                 let selectContent = `Select option action delegated for element: ${validatedArgs.element} (ref: ${validatedArgs.ref})`;
                  if (selectToolResult && selectToolResult.action) {
                     const actionResult = await selectToolResult.action();
                     if (actionResult?.content?.length) {
                         const actionText = actionResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
                         selectContent = actionText;
                     }
                      // Construct success result only if action was executed
                     finalResult = { content: [{ type: 'text', text: selectContent }], isError: false };
                 } else {
                    // If handle didn't return an action, treat it as an error.
                    finalResult = this.createErrorResult(
                        `Tool ${toolName} handle did not return an executable action.`,
                        toolName
                    );
                 }
                 break;

             case 'browserbase_hover':
                 if (!initialPage) throw new Error("Page not available for hover.");
                 // Align with snapshot.ts definition: expect 'ref', 'element'
                 if (typeof validatedArgs.ref !== 'string') throw new Error("Missing 'ref' argument for hover.");
                 if (typeof validatedArgs.element !== 'string') throw new Error("Missing 'element' argument for hover.");

                 // Delegate to the tool's handle function
                 const hoverToolResult = await tool.handle(this as any, validatedArgs);

                 // Construct result message based on delegation
                 let hoverContent = `Hover action delegated for element: ${validatedArgs.element} (ref: ${validatedArgs.ref})`;
                 if (hoverToolResult && hoverToolResult.action) {
                     const actionResult = await hoverToolResult.action();
                     if (actionResult?.content?.length) {
                         const actionText = actionResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
                         hoverContent = actionText;
                     }
                      // Construct success result only if action was executed
                     finalResult = { content: [{ type: 'text', text: hoverContent }], isError: false };
                 } else {
                    // If handle didn't return an action, treat it as an error.
                     finalResult = this.createErrorResult(
                         `Tool ${toolName} handle did not return an executable action.`,
                         toolName
                     );
                 }
                 break;

            // Placeholder - Drag needs more complex handling with bounding boxes or source/target elements
            // case 'browserbase_drag':
            //     if (!initialPage) throw new Error("Page not available for drag.");
            //     // Requires source and target selectors
            //     // await initialPage.dragAndDrop(validatedArgs.startSelector, validatedArgs.endSelector);
            //     console.warn("[Context] Placeholder: Playwright drag action needs implementation.");
            //     finalResult = { content: [{ type: 'text', text: `Drag action placeholder for ${validatedArgs.startSelector} to ${validatedArgs.endSelector}` }], isError: false };
            //     break;

             case 'browserbase_take_screenshot':
                 if (!initialPage) throw new Error("Page not available for screenshot.");
                 // Align with snapshot.ts definition: takes optional 'ref', 'element', 'raw'
                 // Delegate to the tool's handle function
                 const screenshotToolResult = await tool.handle(this as any, validatedArgs);

                 // Construct result message based on delegation
                 let screenshotContent = `Take screenshot action delegated`;
                 if (validatedArgs.ref && validatedArgs.element) {
                    screenshotContent += ` for element: ${validatedArgs.element} (ref: ${validatedArgs.ref})`;
                 } else {
                    screenshotContent += ` for viewport`;
                 }
                 if (screenshotToolResult && screenshotToolResult.action) {
                     const actionResult = await screenshotToolResult.action();
                     // Screenshot action in snapshot.ts handle seems to return specific text
                     if (actionResult?.content?.length) {
                         const actionText = actionResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
                         screenshotContent = actionText;
                     }
                     // NOTE: The original direct implementation saved the screenshot as a resource.
                     // The delegated handle doesn't do that directly. The framework needs to handle
                     // potential image data if the Browserbase call returns it.

                     // Construct success result only if action was executed
                     finalResult = { content: [{ type: 'text', text: screenshotContent }], isError: false };

                 } else {
                    // If handle didn't return an action, treat it as an error.
                     finalResult = this.createErrorResult(
                         `Tool ${toolName} handle did not return an executable action.`,
                         toolName
                     );
                 }
                 break;

             case 'browserbase_get_text': // Example for getting text
                 if (!initialPage) throw new Error("Page not available for get_text.");
                 let textContent;
                 if (validatedArgs.selector && typeof validatedArgs.selector === 'string') {
                     await initialPage.waitForSelector(validatedArgs.selector, { timeout: 10000 });
                     textContent = await initialPage.textContent(validatedArgs.selector);
                 } else {
                     textContent = await initialPage.evaluate(() => document.body.innerText);
                 }
                 finalResult = { content: [{ type: 'text', text: `Retrieved text:\n${textContent || ''}` }], isError: false };
                 break;

            // --- Fallback to existing tool.run for non-browser actions or session creation ---
            default:
                if ("run" in tool && typeof tool.run === "function") {
                  // Tool uses the existing 'run' structure (e.g., session_create, snapshot processing?)
                  finalResult = await tool.run(validatedArgs);

                  // If session_create returned a new session ID, update context
                  // This assumes session_create tool returns something like { newSessionId: '...' } in content
                  const newSessionIdText = finalResult.content?.find(c => c.type === 'text')?.text?.match(/Session created: (\S+)/);
                  if (newSessionIdText && newSessionIdText[1]) {
                      this.currentSessionId = newSessionIdText[1];
                  }


                } else if ("handle" in tool && typeof tool.handle === "function") {
                    // Handle tools that might *only* have a handle function (like session_create)
                    const handleResult = await tool.handle(this as any, validatedArgs);

                    // --- BEGIN ADDED LOGGING ---
                    console.error(`[Context.run] Default Case - tool.handle result for ${toolName}:`, JSON.stringify(handleResult, null, 2));
                    // --- END ADDED LOGGING ---

                    // Check if handle returned a resultOverride (expected structure for session_create)
                    if (handleResult && typeof handleResult === 'object' && 'resultOverride' in handleResult) {
                        // --- BEGIN ADDED LOGGING ---
                        console.error(`[Context.run] Default Case - Found 'resultOverride' property for ${toolName}.`);
                        // --- END ADDED LOGGING ---
                        const override = handleResult.resultOverride;
                        // Construct finalResult from the override
                        finalResult = {
                            content: override?.content ?? [], // Use content from override, default to empty array
                            isError: false, // Assume handle throws error on failure, or override indicates error somehow (TBD if needed)
                        };
                        // Note: session ID update happens *inside* handleCreateSession now.
                        // No need to parse text here.
                    } else {
                        // --- BEGIN ADDED LOGGING ---
                        console.error(`[Context.run] Default Case - Did NOT find 'resultOverride' property for ${toolName}.`);
                        // --- END ADDED LOGGING ---
                        // Fallback if handle doesn't return the expected structure
                        console.warn(`[Context.run] Tool ${toolName} used 'handle' but did not return expected resultOverride.`);
                        finalResult = {
                            content: [{ type: 'text', text: `Executed handle for ${toolName}, but result format unexpected.` }],
                            isError: false, // Or potentially true, depending on desired behavior
                        };
                    }
                }

                else {
                    finalResult = this.createErrorResult(
                      `Tool ${toolName} could not be handled directly via Playwright and has no 'run' function.`,
                      toolName
                    );
                }
                break; // End of default case
        } // End of switch (toolName)

    } catch (error) {
         // Catch errors from the Playwright actions or tool.run/handle fallback
         finalResult = this.createErrorResult(
             `Tool execution failed for ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
             toolName
         );
     }


    // --- Append session state info (unless snapshot) ---
    // (Keep existing state appending logic - it should work fine with Playwright page object)
    if (
      !finalResult.isError &&
      toolName !== "browserbase_snapshot" // Assuming snapshot is handled differently
    ) {
      // Use the currently active page for state, which might have changed if session_create was called
      const currentPage = await this.getActivePage(); // Re-fetch in case session changed
      let currentStateText = `\n\nCurrent Session: ${this.currentSessionId}`;
      if (currentPage && !currentPage.isClosed()) {
        try {
          currentStateText += `\nURL: ${currentPage.url()}\nTitle: ${await currentPage.title()}`;
        } catch (stateError) {
          currentStateText += `\nURL/Title: [Error reading state: ${
            stateError instanceof Error ? stateError.message : String(stateError)
          }]`;
        }
      } else {
        currentStateText += `\nURL/Title: [Page unavailable for session ${this.currentSessionId}]`;
      }
      // Append state to existing text content or add new
      let textContent = finalResult.content?.find((c) => c.type === "text") as
        | TextContent
        | undefined;
      if (textContent) {
        textContent.text += currentStateText;
      } else {
        if (!finalResult.content) finalResult.content = [];
        finalResult.content.push({ type: "text", text: currentStateText });
      }
    }

    // Ensure the function always returns
    return finalResult;
  }

  // Make sure the close method is properly part of the class
  async close(): Promise<void> {
    // Use the centralized close function from sessionManager
    await closeAllSessions(); // Assuming sessionManager exposes this
    // Clear any context-specific state if needed
    this.screenshots.clear();
    this.latestSnapshots.clear();
    this.screenshotResources.clear();
    this.currentSessionId = defaultSessionId; // Reset to default
  }
}
