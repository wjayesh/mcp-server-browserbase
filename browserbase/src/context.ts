import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { BrowserSession } from "./sessionManager.js";
import {
  getSession,
  defaultSessionId,
  closeAllSessions,
} from "./sessionManager.js";
import type { Tool, ToolContext, ToolResult } from "./tools/tool.js";
import type { Config } from "./config.js";
import {
  Resource,
  CallToolResult,
  TextContent,
  ImageContent,
  ResourceListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PageSnapshot } from "./pageSnapshot.js";
import { Writable } from "stream"; // Import Writable for process.stderr
import type { Page, Locator } from "playwright"; // Import Page and Locator types

// Define ToolActionResult locally if not exported
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
  private latestSnapshots = new Map<string, PageSnapshot>();
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

  // --- Snapshot State Handling (Using PageSnapshot) ---

  /**
   * Returns the latest PageSnapshot for the currently active session.
   * Throws an error if no snapshot is available for the active session.
   */
  snapshotOrDie(): PageSnapshot {
    const snapshot = this.latestSnapshots.get(this.currentSessionId);
    if (!snapshot) {
      throw new Error(
        `No snapshot available for the current session (${this.currentSessionId}). Capture a snapshot first.`
      );
    }
    return snapshot;
  }

  /**
   * Clears the snapshot for the currently active session.
   */
  clearLatestSnapshot(): void {
    this.latestSnapshots.delete(this.currentSessionId);
  }

  /**
   * Captures a new PageSnapshot for the currently active session and stores it.
   * Returns the captured snapshot or undefined if capture failed.
   */
  async captureSnapshot(): Promise<PageSnapshot | undefined> {
    const logPrefix = `[Context.captureSnapshot] ${new Date().toISOString()} Session ${
      this.currentSessionId
    }:`;
    let page;
    try {
      page = await this.getActivePage();
    } catch (error) {
      this.clearLatestSnapshot();
      return undefined;
    }

    if (!page) {
      this.clearLatestSnapshot();
      return undefined;
    }

    try {
      await this.waitForTimeout(100); // Small delay for UI settlement
      const snapshot = await PageSnapshot.create(page);
      this.latestSnapshots.set(this.currentSessionId, snapshot);
      return snapshot;
    } catch (error) {
      process.stderr.write(
        `${logPrefix} Failed to capture snapshot: ${
          error instanceof Error ? error.message : String(error)
        }\\n`
      ); // Enhanced logging
      this.clearLatestSnapshot();
      return undefined;
    }
  }

  // --- Resource Handling Methods ---

  listResources(): Resource[] {
    const resources: Resource[] = [];
    for (const [name, data] of this.screenshotResources.entries()) {
      resources.push({
        uri: data.uri,
        mimeType: `image/${data.format}`, // Ensure correct mime type
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
          mimeType: `image/${data.format}`, // Ensure correct mime type
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
    if (!session || !session.page || session.page.isClosed()) {
      try {
        // getSession does not support a refresh flag currently.
        // If a session is invalid, it needs to be recreated or re-established upstream.
        // For now, just return null if the fetched session is invalid.
        const currentSession = await getSession(
          this.currentSessionId,
          this.config
        );
        if (
          !currentSession ||
          !currentSession.page ||
          currentSession.page.isClosed()
        ) {
          return null;
        }
        return currentSession.page;
      } catch (refreshError) {
        return null;
      }
    }
    return session.page;
  }

  public async getActiveBrowser(): Promise<BrowserSession["browser"] | null> {
    const session = await getSession(this.currentSessionId, this.config);
    if (!session || !session.browser || !session.browser.isConnected()) {
      try {
        // getSession does not support a refresh flag currently.
        const currentSession = await getSession(
          this.currentSessionId,
          this.config
        );
        if (
          !currentSession ||
          !currentSession.browser ||
          !currentSession.browser.isConnected()
        ) {
          return null;
        }
        return currentSession.browser;
      } catch (refreshError) {
        return null;
      }
    }
    return session.browser;
  }

  public async waitForTimeout(timeoutMillis: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, timeoutMillis));
  }

  private createErrorResult(message: string, toolName: string): CallToolResult {
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }

  // --- Refactored Action Execution with Retries ---
  private async executeRefAction(
    toolName: string,
    validatedArgs: any,
    actionFn: (
      page: Page,
      identifier: string | undefined,
      args: any,
      locator: Locator | undefined,
      identifierType: "ref" | "selector" | "none"
    ) => Promise<ToolActionResult | void | string>,
    requiresIdentifier: boolean = true
  ): Promise<{ resultText: string; actionResult?: ToolActionResult | void }> {
    let lastError: Error | null = null;
    let page: Page | null = null;
    let actionResult: ToolActionResult | void | undefined;
    let resultText = "";
    let identifier: string | undefined = undefined;
    let identifierType: "ref" | "selector" | "none" = "none";

    // --- Get page and snapshot BEFORE the loop ---
    page = await this.getActivePage();
    if (!page) {
      throw new Error("Failed to get active page before action attempts.");
    }

    // Get the CURRENT latest snapshot - DO NOT capture a new one here.
    const snapshot = this.latestSnapshots.get(this.currentSessionId);
    const initialSnapshotIdentifier = snapshot?.text().substring(0, 60).replace(/\\n/g, '\\\\n') ?? "[No Snapshot]";

    let locator: Locator | undefined;

    // --- Resolve locator: Prioritize selector, then ref ---
    if (validatedArgs?.selector) {
      identifier = validatedArgs.selector;
      identifierType = "selector";
      if (!identifier) {
         throw new Error(`Missing required 'selector' argument for tool ${toolName}.`);
      }
      try {
        locator = page.locator(identifier);
        process.stderr.write(`[Context.executeRefAction ${toolName} Pre-Action] Using provided CSS selector: ${identifier}\\n`);
      } catch (locatorError) {
        throw new Error(`Failed to create locator for selector '${identifier}': ${locatorError instanceof Error ? locatorError.message : String(locatorError)}`);
      }
    } else if (validatedArgs?.ref) {
      identifier = validatedArgs.ref;
      identifierType = "ref";
      if (!identifier) {
        throw new Error(`Missing required 'ref' argument for tool ${toolName}.`);
      }
      if (!snapshot) {
        throw new Error(`Cannot resolve ref '${identifier}' because no snapshot is available for session ${this.currentSessionId}. Capture a snapshot or ensure one exists.`);
      }
      try {
        // Resolve using the snapshot we just retrieved
        locator = snapshot.refLocator(identifier);
        process.stderr.write(`[Context.executeRefAction ${toolName} Pre-Action] Successfully resolved ref ${identifier} using existing snapshot - ${initialSnapshotIdentifier}\\n`);
      } catch (locatorError) {
        // Use the existing snapshot identifier in the error
        throw new Error(
          `Failed to resolve ref ${identifier} using existing snapshot ${initialSnapshotIdentifier} before action attempt: ${locatorError instanceof Error ? locatorError.message : String(locatorError)}`
        );
      }
    } else if (requiresIdentifier) {
      // If neither ref nor selector is provided, but one is required
       throw new Error(`Missing required 'ref' or 'selector' argument for tool ${toolName}.`);
    } else {
       // No identifier needed or provided
       identifierType = "none"; // Explicitly set to none
       process.stderr.write(`[Context.executeRefAction ${toolName} Pre-Action] No ref or selector required/provided.\\n`);
    }

    // --- Single Attempt ---
    const logPrefix = `[Context.executeRefAction ${toolName}] ${new Date().toISOString()}:`;
    try {
      // Log which identifier/locator we ARE using for this attempt
      if (identifierType === "selector") {
        process.stderr.write(`${logPrefix} Using locator resolved from selector: ${identifier}\\n`);
      } else if (identifierType === "ref") {
        process.stderr.write(`${logPrefix} Using locator resolved from ref: ${identifier} (Snapshot: ${initialSnapshotIdentifier})\\n`);
      } else {
        process.stderr.write(`${logPrefix} Proceeding without specific element locator.\\n`);
      }

      // Pass page, the used identifier (selector or ref), args, the resolved locator, and identifierType
      const actionFnResult = await actionFn(page, identifier, validatedArgs, locator, identifierType);

      if (typeof actionFnResult === "string") {
        resultText = actionFnResult;
        actionResult = undefined;
      } else {
        actionResult = actionFnResult;
        const content = actionResult?.content;
        if (Array.isArray(content) && content.length > 0) {
          resultText =
            content
              .map((c: { type: string; text?: string }) =>
                c.type === "text" ? c.text : `[${c.type}]`
              )
              .filter(Boolean)
              .join(" ") || `${toolName} action completed.`;
        } else {
          resultText = `${toolName} action completed successfully.`;
        }
      }
      lastError = null;
      return { resultText, actionResult };
    } catch (error: any) {
      // Throw the error immediately if the single attempt fails
      throw new Error(
        `Action ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async run(tool: Tool<any>, args: any): Promise<CallToolResult> {
    const toolName = tool.schema.name;
    const logRunPrefix = `[Context.run ${toolName}]`; // Prefix for run-level logs
    // --- NEW LOG ---\n    // console.error(`${logRunPrefix} START Received tool Args: ${JSON.stringify(args)}`);
    process.stderr.write(`${logRunPrefix} START Received tool Args: ${JSON.stringify(args)}\\n`); // Changed and added newline
    // -------------
    let initialPage: Page | null = null;
    let initialBrowser: BrowserSession["browser"] | null = null;
    let toolResultFromHandle: ToolResult | null = null; // Legacy handle result
    let finalResult: CallToolResult = { // Initialize finalResult here
      content: [{ type: "text", text: `Initialization error for ${toolName}` }],
      isError: true,
    };

    const logPrefix = `[Context.run ${toolName}] ${new Date().toISOString()}:`;

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

    const previousSessionId = this.currentSessionId;
    if (
      validatedArgs?.sessionId &&
      validatedArgs.sessionId !== this.currentSessionId
    ) {
      this.currentSessionId = validatedArgs.sessionId;
      this.clearLatestSnapshot();
    }

    if (toolName !== "browserbase_session_create") {
      try {
        const session = await getSession(this.currentSessionId, this.config);
        if (
          !session ||
          !session.page ||
          session.page.isClosed() ||
          !session.browser ||
          !session.browser.isConnected()
        ) {
          if (this.currentSessionId !== previousSessionId) {
            this.currentSessionId = previousSessionId;
          }
          throw new Error(
            `Session ${this.currentSessionId} is invalid or browser/page is not available.`
          );
        }
        initialPage = session.page;
        initialBrowser = session.browser;
      } catch (sessionError) {
        return this.createErrorResult(
          `Error retrieving or validating session ${this.currentSessionId}: ${
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError)
          }`,
          toolName
        );
      }
    }

    let executionResultText = "";
    let actionSucceeded = false;
    let shouldCaptureSnapshotAfterAction = false;
    let postActionSnapshot: PageSnapshot | undefined = undefined;

    try {
      let actionToRun: (() => Promise<ToolActionResult>) | undefined = undefined;
      let shouldCaptureSnapshot = false;

      try {
        if ('handle' in tool && typeof tool.handle === 'function') {
            toolResultFromHandle = await tool.handle(this as any, validatedArgs);
            actionToRun = toolResultFromHandle?.action;
            shouldCaptureSnapshot = toolResultFromHandle?.captureSnapshot ?? false;
            shouldCaptureSnapshotAfterAction = shouldCaptureSnapshot;
        } else {
            throw new Error(`Tool ${toolName} could not be handled (no handle method).`);
        }

        if (actionToRun) {
            const actionResult = await actionToRun();
            if (actionResult?.content) {
                executionResultText = actionResult.content
                    .map((c: { type: string; text?: string }) => c.type === "text" ? c.text : `[${c.type}]`)
                    .filter(Boolean)
                    .join(" ") || `${toolName} action completed.`;
            } else {
                executionResultText = `${toolName} action completed successfully.`;
            }
            actionSucceeded = true;
        } else {
            throw new Error(`Tool ${toolName} handled without action.`);
        }
      } catch (error) {
        process.stderr.write(`${logPrefix} Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}\\n`); // Changed and added newline
        // --- LOG STACK TRACE ---
        if (error instanceof Error && error.stack) {
          // console.error(`${logPrefix} Stack Trace: ${error.stack}`);
          process.stderr.write(`${logPrefix} Stack Trace: ${error.stack}\\n`); // Changed and added newline
        }
        // -----------------------
        finalResult = this.createErrorResult(
          `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
          toolName
        );
        actionSucceeded = false;
        shouldCaptureSnapshotAfterAction = false;
        if (
          this.currentSessionId !== previousSessionId &&
          toolName !== "browserbase_session_create"
        ) {
          this.currentSessionId = previousSessionId;
        }
      } finally {
        if (actionSucceeded && shouldCaptureSnapshotAfterAction) {
          const preSnapshotDelay = 500;
          await this.waitForTimeout(preSnapshotDelay);
          try {
            postActionSnapshot = await this.captureSnapshot();
            if (postActionSnapshot) {
              // Log successful snapshot capture and storage
              // console.error(`[Context.run ${toolName}] Adding final snapshot to result.`);
              process.stderr.write(`[Context.run ${toolName}] Adding final snapshot to result.\\n`); // Changed and added newline
              // finalResult.snapshot = postActionSnapshot.render(); // REMOVED - .render() doesn't exist and text is added later
            } else {
              // console.error(`[Context.run ${toolName}] WARN: Snapshot was expected after action but failed to capture.`);
              process.stderr.write(`[Context.run ${toolName}] WARN: Snapshot was expected after action but failed to capture.\\n`); // Changed and added newline
            }
          } catch (postSnapError) {
            // Log warning, don't fail the whole operation
            // console.warn(`${logPrefix} Error capturing post-action snapshot: ${postSnapError instanceof Error ? postSnapError.message : String(postSnapError)}`);
            process.stderr.write(`[Context.run ${toolName}] WARN: Error capturing post-action snapshot: ${postSnapError instanceof Error ? postSnapError.message : String(postSnapError)}\\n`); // Changed and added newline
          }
        } else if (
          actionSucceeded &&
          toolName === "browserbase_snapshot" &&
          !postActionSnapshot
        ) {
          postActionSnapshot = this.latestSnapshots.get(this.currentSessionId);
        }

        if (actionSucceeded) {
          const currentPage = await this.getActivePage();
          let finalOutputText = executionResultText; // Start with execution text

          if (currentPage) {
            try {
              const url = currentPage.url();
              const title = await currentPage
                .title()
                .catch(() => "[Error retrieving title]");
              finalOutputText += `\n\n- Page URL: ${url}\n- Page Title: ${title}`;
            } catch (pageStateError) {
              finalOutputText +=
                "\n\n- [Error retrieving page state after action]";
            }
          } else {
            finalOutputText += "\n\n- [Page unavailable after action]";
          }

          const snapshotToAdd = postActionSnapshot;
          if (snapshotToAdd) {
            finalOutputText += `\n\n- Page Snapshot\n\`\`\`yaml\n${snapshotToAdd.text()}\n\`\`\`\n`;
            // console.error(`[Context.run ${toolName}] Added snapshot to final result text.`);
            process.stderr.write(`[Context.run ${toolName}] Added snapshot to final result text.\\n`); // Changed and added newline
          } else {
            finalOutputText += `\n\n- [No relevant snapshot available after action]`;
          }

          finalResult = {
            content: [{ type: "text", text: finalOutputText }],
            isError: false,
          };
        } else {
          // Error result is already set in catch block, but ensure it IS set.
          if (!finalResult || !finalResult.isError) {
             finalResult = this.createErrorResult(
               `Unknown error occurred during ${toolName}`,
               toolName
             );
          }
        }

        // --- NEW LOG ---\n      // console.error(`[Context.run ${toolName}] END Returning result: ${JSON.stringify(finalResult)?.substring(0, 200)}...`);
        process.stderr.write(`[Context.run ${toolName}] END Returning result: ${JSON.stringify(finalResult)?.substring(0, 200)}...\\n`); // Changed and added newline
        // -------------

        return finalResult;
      }
    } catch (error) {
      process.stderr.write(`${logPrefix} Error running tool ${toolName}: ${error instanceof Error ? error.message : String(error)}\\n`); // Changed and added newline
      throw error;
    }
  }
}
