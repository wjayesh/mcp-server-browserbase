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
      this.currentSessionId = validatedArgs.sessionId;
      console.error(`Context switched to session ID: ${this.currentSessionId}`); // Add logging
    } else if (toolName === 'browserbase_session_create') {
        // Special case: Don't try to get active page/browser before creating one.
        // Session ID will be set within the handleCreateSession function.
        console.error('Skipping active page check for session creation.');
    } else {
        // If no specific sessionId is provided, ensure we are using the default context
        // (or stick to the last used one if that's the desired behavior - current implementation sticks)
        // If the current ID is NOT default, maybe force it back? Or just use current?
        // For now, we implicitly use whatever this.currentSessionId currently is.
        // We might want to explicitly set to default if no sessionId is passed:
        // this.currentSessionId = defaultSessionId; 
        console.error(`Using existing context session ID: ${this.currentSessionId}`);
    }

    // Get page/browser *after* potentially switching session ID
    // Skip this check only if we are creating a session.
    if (toolName !== "browserbase_session_create") { 
      try { // Wrap in try-catch to handle potential errors from getSession
        initialPage = await this.getActivePage();
        initialBrowser = await this.getActiveBrowser();
        
        if (!initialPage || !initialBrowser) {
            // Error if session (now potentially the one from args) is invalid/not found
            return this.createErrorResult(
              `Failed to get valid page/browser for session ${this.currentSessionId} required by tool ${toolName}`,
              toolName
            );
        }
      } catch (sessionError) {
          // Catch errors during getActivePage/Browser (e.g., from getSession)
          return this.createErrorResult(
              `Error retrieving session ${this.currentSessionId}: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`,
              toolName
          );
      }
    }
    // --- Remove old check position ---
    /* 
    if (
      toolName !== "browserbase_create_session" &&
      toolName !== "browser_session_create" // Remove old name check here too if desired
    ) {
      // Check both names
      initialPage = await this.getActivePage();
      initialBrowser = await this.getActiveBrowser();
      if (!initialPage || !initialBrowser) {
        return this.createErrorResult(
          `Failed to get valid page/browser for session ${this.currentSessionId} required by tool ${toolName}`,
          toolName
        );
      }
    }
    */

    // --- Execute Tool Logic and Dispatch Browserbase Call ---
    // TODO: Decide if tool.handle() is still needed for pre-checks or if all logic is here.
    // For now, assume handle might do validation or setup but not the main action.
    let finalResult: CallToolResult;

    if ("handle" in tool && typeof tool.handle === "function") {
       try {
         // We might still call handle for setup, but ignore its action result
         await tool.handle(this as any, validatedArgs);
         // console.log(`Tool handle completed for ${toolName}`);
       } catch (handleError) {
          // Handle errors from the tool's internal handle function if needed
          return this.createErrorResult(
           `Tool handle function failed for ${toolName}: ${handleError instanceof Error ? handleError.message : String(handleError)}`,
           toolName
         );
       }
    } // We might need an 'else' block if some tools *only* use the old 'run' structure

    // Regardless of handle/run, dispatch the actual Browserbase call
    // (unless handle already returned an error or specific override)
    // Exception: Tools like 'snapshot' might rely on the framework loop (captureSnapshot: true)
    // We need to decide if dispatchBrowserbaseCall should handle *all* tools or only interactive ones.

    // Example: Only dispatch for tools expected to make direct API calls
    const toolsRequiringDispatch = [
        'browserbase_click',
        'browserbase_type',
        'browserbase_drag',
        'browserbase_hover',
        'browserbase_select_option',
        'browserbase_take_screenshot',
        // Add others like navigate, etc.
    ];

    if (toolsRequiringDispatch.includes(toolName)) {
      finalResult = await this.dispatchBrowserbaseCall(toolName, validatedArgs);
    } else if (toolName === 'browserbase_snapshot') {
       // Snapshot might not need a direct dispatch here if captureSnapshot=true handles it.
       // Return a simple confirmation.
       finalResult = { content: [{ type: 'text', text: 'Browserbase snapshot requested.' }], isError: false };
    }
    else if ("run" in tool && typeof tool.run === "function") {
      // Tool uses the existing 'run' structure
      try {
        const toolContext: ToolContext = {
          page: initialPage!,
          browser: initialBrowser!,
          server: this.server,
          sessionId: this.currentSessionId,
          config: this.config,
          context: this,
        };
        finalResult = await tool.run(toolContext, validatedArgs);
      } catch (error) {
        finalResult = this.createErrorResult(
          `Tool run failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          toolName
        );
      }
    } else {
      finalResult = this.createErrorResult(
        `Tool ${toolName} has neither a valid \'run\' nor \'handle\' function.`,
        toolName
      );
    }

    // --- Append session state info (unless snapshot) ---
    if (
      !finalResult.isError &&
      toolName !== "browserbase_snapshot" &&
      toolName !== "browser_snapshot"
    ) {
      const currentPage = await this.getActivePage();
      let currentStateText = `\n\nCurrent Session: ${this.currentSessionId}`;
      if (currentPage && !currentPage.isClosed()) {
        try {
          // Restore the complete template literal content
          currentStateText += `\nURL: ${currentPage.url()}\nTitle: ${await currentPage.title()}`;
        } catch (stateError) {
          // Ensure error is handled correctly
          currentStateText += `\nURL/Title: [Error reading state: ${
            stateError instanceof Error
              ? stateError.message
              : String(stateError)
          }]`;
        }
      } else {
        currentStateText += `\nURL/Title: [Page unavailable]`;
      }
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

  /**
   * Dispatches the appropriate Browserbase API call based on the tool name and arguments.
   * This method centralizes the interaction with the Browserbase service.
   * NOTE: This requires access to a Browserbase client instance.
   * This method serves as a central dispatcher for Browserbase API calls.
   * 
   * Architecture comparison:
   * 
   * 1. Playwright MCP Model:
   *    - Context manages Playwright Page objects (often wrapped in Tab objects)
   *    - tool.handle receives context with access to Playwright Page/Locator
   *    - Action functions directly execute Playwright commands (locator.click(), etc.)
   *    - context.run simply executes the action function containing browser logic
   * 
   * 2. Browserbase MCP Model:
   *    - Tools in src/tools/snapshot.ts prepare arguments but don't make API calls
   *    - The tool.handle function returns an action that context.run doesn't execute
   *    - Context takes responsibility for the actual Browserbase API calls
   *    - context.run identifies tool requests (e.g., 'browserbase_click')
   *    - dispatchBrowserbaseCall maps tool names to specific Browserbase API calls
   * 
   * In summary: Playwright puts browser interaction in the tool's action function,
   * while our Browserbase model centralizes API calls in the Context.
   */
  private async dispatchBrowserbaseCall(toolName: string, params: any): Promise<CallToolResult> {
    console.log(`[Context] Dispatching Browserbase call for: ${toolName} with params:`, params);

    // TODO: Obtain or ensure Browserbase client instance is available here.
    // e.g., const browserbaseClient = this.getBrowserbaseClient();
    // Ensure this.currentSessionId is correctly set before this point.

    try {
      // Map toolName to Browserbase API calls
      switch (toolName) {
        case 'browserbase_click':
          // Replace with: await browserbaseClient.click(this.currentSessionId, params.ref, ...);
          console.warn(`[Context] Placeholder: Simulating Browserbase click for ref ${params.ref}`);
          return { content: [{ type: 'text', text: `Clicked ${params.element} via Browserbase` }], isError: false };

        case 'browserbase_type':
          // Replace with: await browserbaseClient.type(this.currentSessionId, params.ref, params.text, ...);
          console.warn(`[Context] Placeholder: Simulating Browserbase type for ref ${params.ref}, text "${params.text}"`);
          return { content: [{ type: 'text', text: `Typed "${params.text}" into ${params.element} via Browserbase` }], isError: false };

        case 'browserbase_drag':
          // Replace with: await browserbaseClient.drag(this.currentSessionId, params.startRef, params.endRef, ...);
          console.warn(`[Context] Placeholder: Simulating Browserbase drag from ${params.startRef} to ${params.endRef}`);
          return { content: [{ type: 'text', text: `Dragged ${params.startElement} to ${params.endElement} via Browserbase` }], isError: false };

        case 'browserbase_hover':
          // Replace with: await browserbaseClient.hover(this.currentSessionId, params.ref, ...);
          console.warn(`[Context] Placeholder: Simulating Browserbase hover for ref ${params.ref}`);
          return { content: [{ type: 'text', text: `Hovered over ${params.element} via Browserbase` }], isError: false };

        case 'browserbase_select_option':
          // Replace with: await browserbaseClient.selectOption(this.currentSessionId, params.ref, params.values, ...);
          console.warn(`[Context] Placeholder: Simulating Browserbase selectOption for ref ${params.ref}, values ${JSON.stringify(params.values)}`);
          return { content: [{ type: 'text', text: `Selected options in ${params.element} via Browserbase` }], isError: false };

        case 'browserbase_take_screenshot':
          // Replace with: await browserbaseClient.takeScreenshot(this.currentSessionId, { ref: params.ref, raw: params.raw, ... });
          // This might return image data that needs handling/resource registration.
          console.warn(`[Context] Placeholder: Simulating Browserbase takeScreenshot for ref ${params.ref ?? 'viewport'}`);
          // Adapt return value based on actual API response and resource handling needs.
          return { content: [{ type: 'text', text: `Screenshot taken for ${params.element ?? 'viewport'} via Browserbase` }], isError: false };

        // Add cases for other Browserbase tools (navigate, etc.)

        default:
          console.error(`[Context] No Browserbase dispatch logic for tool: ${toolName}`);
          return this.createErrorResult(`Unsupported tool for direct Browserbase dispatch: ${toolName}`, toolName);
      }
    } catch (apiError) {
      console.error(`[Context] Browserbase API call failed for ${toolName}:`, apiError);
      return this.createErrorResult(
        `Browserbase API error for ${toolName}: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
        toolName
      );
    }
  }

  // Make sure the close method is properly part of the class
  async close(): Promise<void> {
    // ... existing code ...
  }
}
