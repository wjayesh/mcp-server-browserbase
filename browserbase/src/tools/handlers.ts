import {
  CallToolResult,
  // TextContent,
  // ImageContent,
  // AccessibilitySnapshot,
  // AccessibilityNode, // May not be exported
} from "@modelcontextprotocol/sdk/types.js";
import { Page } from "playwright-core"; // Only Page needed here now
import {
  getSession,
  createNewBrowserSession,
  defaultSessionId,
  browsers, // Needed temporarily for create_session check
} from "../sessionManager.js";
import { BrowserSession } from "../types.js";
// import { screenshots } from "../resources/handlers.js"; // Now handled within snapshot.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js"; // Needed for notifications

// Import specific tool handlers
import { handleNavigate } from "./navigate.js";
import { handleCreateContext, handleDeleteContext, getContextId } from "./context.js";
import { handleAddCookies, handleDeleteCookies, handleGetCookies } from "./cookies.js";
import {
  handleSnapshot,
  handleTakeScreenshot,
  handleClick,
  handleType,
  handleHover,
  handleSelectOption,
  handleDrag,
  handleGetText,
} from "./snapshot.js";
import { handlePressKey } from "./keyboard.js";
// Placeholders for unimplemented tools
import { handleDialog } from "./dialogs.js";
import { handleInstall } from "./install.js";
import { handleNetwork } from "./network.js";
import { handlePdfSave } from "./pdf.js";
import { handleTabList, handleTabNew, handleTabSelect, handleTabClose } from "./tabs.js";
import { handleFileUpload } from "./files.js";
import { handleConsoleMessages } from "./console.js";
// import { handleScreen... } from "./screen.js"; // No specific screen tools implemented yet
// import { handleUtils... } from "./utils.js"; // No specific utils implemented yet

// Placeholder for the server instance - will be properly injected later
// This is a temporary workaround to satisfy the screenshot notification call.
// In a full refactor, the server instance would be passed or accessible globally.
let serverInstance: Server | null = null;
export function setServerInstance(server: Server) {
  serverInstance = server;
}

// Note: latestSnapshots and findNodeByRef moved to common.ts

// Tool Handler Implementation
export async function handleToolCall(
  name: string,
  args: any,
): Promise<CallToolResult> {
  console.error(
    `Handling tool call: ${name} with args: ${JSON.stringify(args)}`,
  );
  try {
    let sessionObj: BrowserSession | null = null;
    const targetSessionId = args.sessionId || defaultSessionId;

    // --- Context management tools (require no session) ---
    if (name === "browserbase_create_context") {
      return handleCreateContext(args);
    }
    
    if (name === "browserbase_delete_context") {
      return handleDeleteContext(args);
    }

    // --- browserbase_create_session ---
    if (name === "browserbase_create_session") {
      const newSessionId = args.sessionId || `session_${Date.now()}`;
      try {
        if (browsers.has(newSessionId)) {
          console.warn(`Session '${newSessionId}' already exists.`);
          return {
            content: [
              {
                type: "text",
                text: `Session '${newSessionId}' already exists.`,
              },
            ],
            isError: false,
          };
        }
        
        // Check for context settings
        const contextSettings = args.context;
        let contextId: string | undefined;
        
        if (contextSettings) {
          // Get context ID either directly or by name
          if (contextSettings.id) {
            contextId = contextSettings.id;
          } else if (contextSettings.name) {
            contextId = getContextId(contextSettings.name);
            if (!contextId) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Context with name "${contextSettings.name}" not found`,
                  },
                ],
                isError: true,
              };
            }
          }
        }
        
        // Pass context settings to session creation
        const sessionOptions = {
          contextId,
          persistContext: contextSettings?.persist !== false, // Default to true if not specified
        };
        
        await createNewBrowserSession(newSessionId, sessionOptions);
        // Note: We don't need to update defaultBrowserSession here as
        // createNewBrowserSession doesn't automatically set the default.
        console.error(`Successfully created session: ${newSessionId}`);
        return {
          content: [
            {
              type: "text",
              text: `Created new browser session with ID: ${newSessionId}${
                contextId ? ` using context: ${contextId}` : ''
              }`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        console.error(
          `Failed to create browser session '${newSessionId}': ${
            (error as Error).message
          }`,
        );
        return {
          content: [
            {
              type: "text",
              text: `Failed to create browser session '${newSessionId}': ${
                (error as Error).message
              }`,
            },
          ],
          isError: true,
        };
      }
    }

    // --- For other tools, get the validated session ---
    try {
      sessionObj = await getSession(targetSessionId);
    } catch (error) {
      // getSession throws specific errors if session not found or fails validation/recreation
      console.error(
        `Failed to get or validate session ${targetSessionId}: ${
          (error as Error).message
        }`,
      );
      return {
        content: [
          { type: "text", text: `Session handling error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }

    // We have a sessionObj, destructure the page
    const { page } = sessionObj;

    // Final check: Ensure page is usable (might have closed between checks)
    // getSession should have handled this, but a safety check is reasonable
    if (page.isClosed()) {
      console.error(
        `Page for session ${targetSessionId} was closed unexpectedly after validation.`,
      );
      // Attempt recovery maybe? For now, return error.
      return {
        content: [
          {
            type: "text",
            text: `Page for session ${targetSessionId} was closed. Please retry the operation.`,
          },
        ],
        isError: true, // Treat as an error requiring retry
      };
      // throw new Error(`Page for session ${targetSessionId} is closed.`);
    }

    // --- Execute Tool Logic ---
    switch (name) {
      case "browserbase_navigate":
        return handleNavigate(page, args, targetSessionId);

      case "browserbase_snapshot": {
        return handleSnapshot(page, targetSessionId);
      }

      case "browserbase_take_screenshot": {
        return handleTakeScreenshot(page, args, targetSessionId, serverInstance);
      }

      case "browserbase_click":
        return handleClick(page, args, targetSessionId);

      case "browserbase_type":
        return handleType(page, args, targetSessionId);

      case "browserbase_drag":
        return handleDrag(page, args, targetSessionId);

      case "browserbase_hover":
        return handleHover(page, args, targetSessionId);

      case "browserbase_select_option": {
        return handleSelectOption(page, args, targetSessionId);
      }

      case "browserbase_press_key": {
        return handlePressKey(page, args, targetSessionId);
      }

      case "browserbase_get_text": {
        return handleGetText(page, args, targetSessionId);
      }

      case "browserbase_add_cookies": {
        return handleAddCookies(page, args, targetSessionId);
      }

      case "browserbase_delete_cookies": {
        return handleDeleteCookies(page, args, targetSessionId);
      }

      case "browserbase_get_cookies": {
        return handleGetCookies(page, args, targetSessionId);
      }

      // Add cases for other potential tools, delegating to handleNotImplemented for now
      case "browserbase_navigate_back":
      case "browserbase_navigate_forward":
      case "browserbase_tab_list":
      case "browserbase_tab_new":
      case "browserbase_tab_select":
      case "browserbase_tab_close":
      case "browserbase_console_messages":
      case "browserbase_file_upload":
      case "browserbase_pdf_save":
      case "browserbase_close":
      case "browserbase_wait":
      case "browserbase_resize":
      case "browserbase_install":
      case "browserbase_handle_dialog":
        return handleNotImplemented(name, args);

      // --- Navigation --- (Placeholders)
      case "browserbase_navigate_back": // TODO
      case "browserbase_navigate_forward": // TODO
        return handleNotImplemented(name, args);
      // --- Tabs --- (Placeholders)
      case "browserbase_tab_list": return handleTabList(page, args, targetSessionId);
      case "browserbase_tab_new": return handleTabNew(page, args, targetSessionId);
      case "browserbase_tab_select": return handleTabSelect(page, args, targetSessionId);
      case "browserbase_tab_close": return handleTabClose(page, args, targetSessionId);
      // --- Console --- (Placeholder)
      case "browserbase_console_messages": return handleConsoleMessages(page, args, targetSessionId);
      // --- Files --- (Placeholder)
      case "browserbase_file_upload": return handleFileUpload(page, args, targetSessionId);
      // --- PDF --- (Placeholder)
      case "browserbase_pdf_save": return handlePdfSave(page, args, targetSessionId);
      // --- Dialogs --- (Placeholder)
      case "browserbase_handle_dialog": return handleDialog(page, args, targetSessionId);
      // --- Installation --- (Placeholder)
      case "browserbase_install": return handleInstall(page, args, targetSessionId);
      // --- Utilities --- (Placeholders, need defining in utils.ts)
      case "browserbase_close": // TODO
      case "browserbase_wait": // TODO
      case "browserbase_resize": // TODO
        return handleNotImplemented(name, args);

      default:
        console.error(`Unknown tool requested: ${name}`);
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    // Catch errors from session acquisition or general tool handling
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Critical error handling tool call '${name}' with args ${JSON.stringify(
      args,
    )}: ${errorMsg}
${(error as Error).stack}`);
    // Session recovery logic is now primarily within getSession
    // If getSession succeeded but something else failed, return a general error
    return {
      content: [
        {
          type: "text",
          text: `Failed to handle tool call '${name}': ${errorMsg}`,
        },
      ],
      isError: true,
    };
    // Simplified error handling here as session issues should be caught earlier
  }
}

// Placeholder handlers for tools not yet implemented
// These could eventually be moved to their respective files (dialogs.ts, etc.)
async function handleNotImplemented(name: string, args: any): Promise<CallToolResult> {
  console.warn(`Tool '${name}' called but is not implemented.`);
  return {
    content: [{ type: "text", text: `Tool '${name}' is not implemented.` }],
    isError: false, // Or true, depending on desired behavior
  };
} 