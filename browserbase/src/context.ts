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
import { Writable } from 'stream'; // Import Writable for process.stderr
import type { Page } from "playwright"; // Import Page type

// Define ToolActionResult locally if not exported
export type ToolActionResult =
  | { content?: (ImageContent | TextContent)[] }
  | undefined
  | void;

const MAX_ACTION_ATTEMPTS = 3; // Number of times to attempt a ref-based action
const RETRY_DELAY_MS = 500; // Delay between retries
const EXPLICIT_WAIT_TIMEOUT_MS = 7000; // Timeout for explicit waits before actions

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
        throw new Error(`No snapshot available for the current session (${this.currentSessionId}). Capture a snapshot first.`);
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
    const logPrefix = `[Context.captureSnapshot] ${new Date().toISOString()} Session ${this.currentSessionId}:`;
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
           const currentSession = await getSession(this.currentSessionId, this.config);
           if (!currentSession || !currentSession.page || currentSession.page.isClosed()) {
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
             const currentSession = await getSession(this.currentSessionId, this.config);
            if (!currentSession || !currentSession.browser || !currentSession.browser.isConnected()) {
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
    actionFn: (page: Page, ref: string | undefined, args: any) => Promise<ToolActionResult | void | string>, // ref can be undefined for non-ref actions handled here
    requiresRef: boolean = true
  ): Promise<{ resultText: string; actionResult?: ToolActionResult | void }> {
    let lastError: Error | null = null;
    let page: Page | null = null;
    let actionResult: ToolActionResult | void | undefined;
    let resultText = "";

    for (let attempt = 1; attempt <= MAX_ACTION_ATTEMPTS; attempt++) {
      const logPrefix = `[Context.executeRefAction ${toolName} Att ${attempt}/${MAX_ACTION_ATTEMPTS}] ${new Date().toISOString()}:`;

      try {
        page = await this.getActivePage();
        if (!page) {
          throw new Error("Failed to get active page for action attempt.");
        }

        const snapshot = await this.captureSnapshot();
        if (!snapshot && requiresRef) { // Only fail if snapshot is needed for ref-based ops
            throw new Error("Failed to capture pre-action snapshot.");
        }

        const ref = validatedArgs?.ref;
        if (requiresRef && !ref) {
             throw new Error(`Missing required 'ref' argument for tool ${toolName}.`);
        }

         if (ref) { // Only perform waits if a ref is actually being used
            const locator = page.locator(ref);
            try {
              // Wait only for visible. Playwright actions implicitly handle enabled checks.
              await locator.waitFor({ state: 'visible', timeout: EXPLICIT_WAIT_TIMEOUT_MS });
            } catch (waitError) {
              throw new Error(`Element ${ref} was not visible within ${EXPLICIT_WAIT_TIMEOUT_MS}ms: ${waitError instanceof Error ? waitError.message : String(waitError)}`);
            }
         }

        const actionFnResult = await actionFn(page, ref, validatedArgs);

        if (typeof actionFnResult === 'string') {
            resultText = actionFnResult;
            actionResult = undefined;
        } else {
            actionResult = actionFnResult;
             const content = actionResult?.content;
             if (Array.isArray(content) && content.length > 0) {
                  resultText = content.map((c: { type: string, text?: string }) => c.type === 'text' ? c.text : `[${c.type}]`).filter(Boolean).join(' ') || `${toolName} action completed.`;
             } else {
                resultText = `${toolName} action completed successfully.`;
             }
        }
        lastError = null;
        return { resultText, actionResult };

      } catch (error: any) {
        lastError = error;
        if (attempt < MAX_ACTION_ATTEMPTS) {
          await this.waitForTimeout(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError ?? new Error(`Action ${toolName} failed after ${MAX_ACTION_ATTEMPTS} attempts.`);
  }


  async run(tool: Tool<any>, args: any): Promise<CallToolResult> {
    const toolName = tool.schema.name;
    let initialPage: Page | null = null;
    let initialBrowser: BrowserSession["browser"] | null = null;
    let toolResultFromHandle: ToolResult | null = null; // Legacy handle result

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
    if (validatedArgs?.sessionId && validatedArgs.sessionId !== this.currentSessionId) {
        this.currentSessionId = validatedArgs.sessionId;
        this.clearLatestSnapshot();
    }

     if (toolName !== "browserbase_session_create") {
        try {
            const session = await getSession(this.currentSessionId, this.config);
            if (!session || !session.page || session.page.isClosed() || !session.browser || !session.browser.isConnected()) {
                if (this.currentSessionId !== previousSessionId) {
                    this.currentSessionId = previousSessionId;
                }
                 throw new Error(`Session ${this.currentSessionId} is invalid or browser/page is not available.`);
            }
            initialPage = session.page;
            initialBrowser = session.browser;
        } catch (sessionError) {
            return this.createErrorResult(
                `Error retrieving or validating session ${this.currentSessionId}: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`,
                toolName
            );
        }
    }

    let finalResult: CallToolResult;
    let executionResultText = '';
    let actionSucceeded = false;
    let shouldCaptureSnapshotAfterAction = false;
    let postActionSnapshot: PageSnapshot | undefined = undefined;

    try {
        switch (toolName) {
            // --- Ref-based actions ---
            case 'browserbase_click': {
                 const { resultText: clickResultText } = await this.executeRefAction(
                     toolName,
                     validatedArgs,
                     async (page, ref) => {
                         if (!ref) throw new Error("Ref is required for click");
                         await page.click(ref);
                         return `${toolName} successful for ref ${ref}.`;
                     }
                 );
                 executionResultText = clickResultText;
                 shouldCaptureSnapshotAfterAction = true;
                 break;
            }
            case 'browserbase_type': {
                 const { resultText: typeResultText } = await this.executeRefAction(
                     toolName,
                     validatedArgs,
                     async (page, ref, args) => {
                         if (!ref) throw new Error("Ref is required for type");
                         await page.fill(ref, args.text || '');
                         if (args.submit) {
                             await page.press(ref, 'Enter');
                         }
                         return `${toolName} successful for ref ${ref}. Text: "${args.text}". Submitted: ${!!args.submit}.`;
                     }
                 );
                 executionResultText = typeResultText;
                 shouldCaptureSnapshotAfterAction = true;
                 break;
            }
             case 'browserbase_select_option': {
                 const { resultText: selectResultText } = await this.executeRefAction(
                     toolName,
                     validatedArgs,
                     async (page, ref, args) => {
                         if (!ref) throw new Error("Ref is required for select_option");
                         const values = args.values || [];
                         if (values.length === 0) throw new Error("No values provided to select.");
                         await page.selectOption(ref, values);
                         return `${toolName} successful for ref ${ref}. Values: ${values.join(', ')}.`;
                     }
                 );
                 executionResultText = selectResultText;
                 shouldCaptureSnapshotAfterAction = true;
                 break;
             }
             case 'browserbase_hover': {
                 const { resultText: hoverResultText } = await this.executeRefAction(
                     toolName,
                     validatedArgs,
                     async (page, ref) => {
                          if (!ref) throw new Error("Ref is required for hover");
                          await page.hover(ref);
                          return `${toolName} successful for ref ${ref}.`;
                     }
                 );
                 executionResultText = hoverResultText;
                 shouldCaptureSnapshotAfterAction = false; // Hover usually doesn't mandate a new snapshot
                 break;
             }
             case 'browserbase_drag': {
                 const { resultText: dragResultText } = await this.executeRefAction(
                     toolName,
                     validatedArgs,
                     async (page, startRef, args) => {
                         if (!startRef) throw new Error("startRef is required for drag");
                         const endRef = args.endRef;
                         if (!endRef) throw new Error("Missing 'endRef' for drag operation.");

                         // Ensure both elements are visible before attempting drag
                         const startLocator = page.locator(startRef);
                         const endLocator = page.locator(endRef);
                         await Promise.all([
                              startLocator.waitFor({ state: 'visible', timeout: EXPLICIT_WAIT_TIMEOUT_MS }),
                              endLocator.waitFor({ state: 'visible', timeout: EXPLICIT_WAIT_TIMEOUT_MS })
                         ]);
                         await page.dragAndDrop(startRef, endRef);
                         return `${toolName} successful from ref ${startRef} to ref ${endRef}.`;
                     },
                     true // Requires startRef
                 );
                 executionResultText = dragResultText;
                 shouldCaptureSnapshotAfterAction = true;
                 break;
            }
             case 'browserbase_take_screenshot': {
                  const requiresRefForScreenshot = !!validatedArgs.ref;
                  const { resultText: screenshotResultText } = await this.executeRefAction(
                      toolName,
                      validatedArgs,
                      async (page, ref, args): Promise<ToolActionResult> => { // Explicitly return ToolActionResult
                           const screenshotOptions: Parameters<Page['screenshot']>[0] = {
                                type: args.raw ? 'png' : 'jpeg'
                           };
                           const format = args.raw ? 'png' : 'jpeg';
                           const mimeType = `image/${format}`;

                           let screenshotBytesBase64: string;
                           if (ref) {
                                const bytesBuffer = await page.locator(ref).screenshot(screenshotOptions);
                                screenshotBytesBase64 = bytesBuffer.toString('base64');
                           } else {
                                const bytesBuffer = await page.screenshot({ ...screenshotOptions, fullPage: true });
                                screenshotBytesBase64 = bytesBuffer.toString('base64');
                           }

                           const name = `screenshot-${Date.now()}.${format}`;
                           this.addScreenshot(name, format, screenshotBytesBase64);
                           const uri = `mcp://screenshots/${name}`;

                           // Conform to ToolActionResult structure with ImageContent and TextContent
                           return {
                                content: [
                                    {
                                        type: 'image',
                                        mimeType: mimeType,
                                        data: screenshotBytesBase64, // Use 'data' as expected by ImageContent
                                        uri: uri
                                    } as ImageContent, // Cast to ensure type match if needed, SDK types preferred
                                     {
                                         type: 'text',
                                         text: `Screenshot captured (${ref ? 'element ' + ref : 'full page'}) and saved as ${name}. URI: ${uri}`
                                     } as TextContent
                                ]
                           };
                      },
                      requiresRefForScreenshot
                  );
                  executionResultText = screenshotResultText;
                  shouldCaptureSnapshotAfterAction = false;
                  break;
             }

            // --- Non-Ref based actions ---
            case 'browserbase_navigate':
                if (!initialPage) throw new Error("Page not available for navigation.");
                if (typeof validatedArgs.url !== 'string') throw new Error("Missing 'url' argument for navigate.");
                await initialPage.goto(validatedArgs.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await this.waitForTimeout(500);
                executionResultText = `Navigated to ${validatedArgs.url}`;
                shouldCaptureSnapshotAfterAction = true;
                break;

            case 'browserbase_get_text':
                 if (!initialPage) throw new Error("Page not available for get_text.");
                 let textContent;
                 const selector = validatedArgs.selector?.trim();
                 if (selector) {
                     try {
                         await initialPage.waitForSelector(selector, { timeout: 5000, state: 'attached' });
                         textContent = await initialPage.textContent(selector);
                     } catch {
                         textContent = "[Selector not found]";
                     }
                 } else {
                     textContent = await initialPage.evaluate(() => document.body.innerText);
                 }
                 executionResultText = `Retrieved text:\n${textContent || ''}`;
                 shouldCaptureSnapshotAfterAction = false;
                 break;

            case 'browserbase_snapshot':
                const capturedSnap = await this.captureSnapshot();
                if (capturedSnap) {
                    executionResultText = 'Snapshot captured successfully.';
                    postActionSnapshot = capturedSnap;
                } else {
                     throw new Error("Explicit snapshot capture failed.");
                }
                 shouldCaptureSnapshotAfterAction = false;
                break;

             case 'browser_press_key':
                if (!initialPage) throw new Error("Page not available for press_key.");
                const key = validatedArgs.key;
                if (typeof key !== 'string') throw new Error("Missing 'key' argument for press_key.");

                 if (key.length === 1) {
                    await initialPage.keyboard.type(key);
                 } else {
                     await initialPage.keyboard.press(key);
                 }
                 await this.waitForTimeout(200);
                 executionResultText = `Pressed key: ${key}`;
                 shouldCaptureSnapshotAfterAction = true;
                 break;

            // --- Tools with standard 'run' method ---
            default:
                if ('run' in tool && typeof tool.run === 'function') {
                    const runResult = await tool.run(validatedArgs);
                     const resultTextContent = runResult.content?.find((c: { type: string, text?: string }) => c.type === 'text')?.text ?? `${toolName} completed.`;

                     if (toolName === 'browserbase_session_create') {
                         const newSessionIdMatch = resultTextContent.match(/Session (?:created|ID): (\S+)/);
                        if (newSessionIdMatch?.[1] && newSessionIdMatch[1] !== this.currentSessionId) {
                            this.currentSessionId = newSessionIdMatch[1];
                            this.clearLatestSnapshot();
                        }
                     }

                    if (runResult.isError) {
                        throw new Error(resultTextContent);
                    }
                    executionResultText = resultTextContent;
                    shouldCaptureSnapshotAfterAction = false;
                }
                // --- Legacy 'handle' method ---
                else if ('handle' in tool && typeof tool.handle === 'function') {
                     toolResultFromHandle = await tool.handle(this as any, validatedArgs);
                     if (toolResultFromHandle?.resultOverride) {
                         executionResultText = toolResultFromHandle.resultOverride.content?.map((c: any) => c.type === 'text' ? c.text : `[${c.type}]`).join(' ') ?? '';
                     } else if (toolResultFromHandle?.action) {
                          executionResultText = `Tool ${toolName} handled, but action execution might have been missed.`;
                     } else {
                        executionResultText = `${toolName} handled without action.`;
                     }
                     shouldCaptureSnapshotAfterAction = toolResultFromHandle?.captureSnapshot ?? false;
                }
                else {
                     throw new Error(`Tool ${toolName} could not be handled (no run/handle method or unhandled case).`);
                }
                break;
        }

        actionSucceeded = true;
        finalResult = { content: [{ type: 'text', text: executionResultText }], isError: false };

    } catch (error) {
        finalResult = this.createErrorResult(
            `Tool execution failed for ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
            toolName
        );
        actionSucceeded = false;
        shouldCaptureSnapshotAfterAction = false;
         if (this.currentSessionId !== previousSessionId && toolName !== 'browserbase_session_create') {
              this.currentSessionId = previousSessionId;
         }
    } finally {
        if (actionSucceeded && shouldCaptureSnapshotAfterAction) {
            const preSnapshotDelay = 500;
            await this.waitForTimeout(preSnapshotDelay);
            try {
                postActionSnapshot = await this.captureSnapshot();
            } catch(postSnapError) {
                 // Log warning, don't fail the whole operation
            }
        } else if (actionSucceeded && toolName === 'browserbase_snapshot' && !postActionSnapshot) {
             postActionSnapshot = this.latestSnapshots.get(this.currentSessionId);
        }

        if (actionSucceeded) {
            const currentPage = await this.getActivePage();
            let finalOutputText = executionResultText; // Start with execution text

            if (currentPage) {
                 try {
                     const url = currentPage.url();
                     const title = await currentPage.title().catch(() => '[Error retrieving title]');
                     finalOutputText += `\n\n- Page URL: ${url}\n- Page Title: ${title}`;
                 } catch (pageStateError) {
                      finalOutputText += "\n\n- [Error retrieving page state after action]";
                 }
            } else {
                 finalOutputText += "\n\n- [Page unavailable after action]";
            }

            const snapshotToAdd = postActionSnapshot;
            if (snapshotToAdd) {
                finalOutputText += `\n\n- Page Snapshot\n\`\`\`yaml\n${snapshotToAdd.text()}\n\`\`\`\n`;
            } else {
                 finalOutputText += `\n\n- [No relevant snapshot available after action]`;
            }

            finalResult = { content: [{ type: 'text', text: finalOutputText }], isError: false };

        } else {
            // Error result is already set in catch block
        }
    }

    return finalResult;
  }


  async close(): Promise<void> {
    await closeAllSessions();
    this.screenshots.clear();
    this.latestSnapshots.clear();
    this.screenshotResources.clear();
    this.currentSessionId = defaultSessionId;
  }
}
