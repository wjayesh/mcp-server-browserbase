import { z } from "zod";
// Import ToolResult and adjust Tool type usage
import type { Tool, ToolSchema, ToolContext, ToolResult } from "./tool.js";
import { createSuccessResult, createErrorResult } from "./toolUtils.js"; // Assuming these exist
import type { Context } from "../context.js"; // For handle signature
import type { ToolActionResult } from "../context.js"; // For action return type
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
// Remove Browserbase SDK import if not needed directly anymore
// import Browserbase from "@browserbasehq/sdk";
import dotenv from "dotenv";

// Import SessionManager functions
import {
  createNewBrowserSession,
  defaultSessionId,
  ensureDefaultSessionInternal,
  type BrowserSession,
} from "../sessionManager.js";

// Remove redundant dotenv config call
// dotenv.config();

// --- Tool: Create Session ---
const CreateSessionInputSchema = z.object({
  // Keep sessionId optional, but clarify its role
  sessionId: z
    .string()
    .optional()
    .describe(
      "Optional session ID to use/reuse. If not provided or invalid, a new session is created."
    ),
});
type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

const createSessionSchema: ToolSchema<typeof CreateSessionInputSchema> = {
  name: "browserbase_session_create", // Renamed
  description:
    "Create or reuse a cloud browser session using Browserbase. Updates the active session.", // Updated description
  inputSchema: CreateSessionInputSchema,
};

// No need for SessionContext interface here, Context is sufficient
// interface SessionContext extends Context {
//     currentSessionConnectUrl?: string; // Add connectUrl property
// }

// Handle function for CreateSession using SessionManager
async function handleCreateSession(
  context: Context,
  params: CreateSessionInput
): Promise<ToolResult> {
  try {
    const config = context.getConfig(); // Get config from context
    let targetSessionId: string;

    // Decide session ID: Use provided, or default.
    if (params.sessionId) {
        // If a specific ID is provided, use it.
        // NOTE: SessionManager's createNewBrowserSession currently always creates *new* underlying
        // Browserbase sessions. True reuse might need changes in SessionManager.
        // For now, we'll use the provided ID to *label* the new session in our map.
        targetSessionId = params.sessionId;
        console.error(`Attempting to create/assign session with specified ID: ${targetSessionId}`);
    } else {
        // If no ID is provided, target the default session.
        targetSessionId = defaultSessionId;
        console.error(`Attempting to create/ensure default session (ID: ${targetSessionId})`);
    }

    // Use the SessionManager to create/ensure the session with the target ID
    // ensureDefaultSessionInternal handles creation/validation logic specifically for the default ID.
    // For non-default IDs, createNewBrowserSession will be used (implicitly, or explicitly if we refactor getSession/ensureDefault).
    // For simplicity and focusing on the default flow, let's use createNew directly for non-default,
    // and ensureDefault for the default case.
    let session: BrowserSession;
    if (targetSessionId === defaultSessionId) {
        // ensureDefaultSessionInternal handles finding existing/creating new *default* session
        session = await ensureDefaultSessionInternal(config); // Use ensureDefault for the default case
    } else {
        // For specific IDs, use createNewBrowserSession. This overwrites if ID already exists.
        session = await createNewBrowserSession(targetSessionId, config);
    }


    // Check if session creation/retrieval was successful
    if (!session || !session.browser || !session.page) {
      throw new Error(`SessionManager failed to return a valid session object for ID: ${targetSessionId}`);
    }

    // Update context's current session ID to the one we targeted
    context.currentSessionId = targetSessionId;
    console.error(`Successfully ensured session and set active ID: ${targetSessionId}`);

    // Prepare the result
    const result: ToolActionResult = {
      content: [
        {
          type: "text",
          text: `Created and set active Browserbase session ID: ${targetSessionId}`,
        },
      ],
    };

    return {
      resultOverride: result,
      code: [],
      captureSnapshot: false, // No page state change yet
      waitForNetwork: false,
    };
  } catch (error: any) {
    console.error(`CreateSession handle failed: ${error.message || error}`);
    // Re-throw the error so the main run function in context.ts can handle it
    throw new Error(
      `Failed to create Browserbase session: ${error.message || error}`
    );
  }
}

// Define tool using handle
const createSessionTool: Tool<typeof CreateSessionInputSchema> = {
  capability: "core", // Add capability
  schema: createSessionSchema,
  handle: handleCreateSession,
};

// Export the single tool object as default
export default createSessionTool; // Export the object directly
// export default [createSessionTool]; // Export as an array containing the tool
