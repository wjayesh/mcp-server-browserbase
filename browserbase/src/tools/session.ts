import { z } from "zod";
// Import ToolResult and adjust Tool type usage
import type { Tool, ToolSchema, ToolContext, ToolResult } from "./tool.js"; // Assuming these exist
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
    "Create or reuse a cloud browser session using Browserbase. Updates the active session.", 
  inputSchema: CreateSessionInputSchema,
};


// Handle function for CreateSession using SessionManager
async function handleCreateSession(
  context: Context,
  params: CreateSessionInput
): Promise<ToolResult> {
  // The main logic will now be inside the returned 'action' function
  const action = async (): Promise<ToolActionResult> => {
    try {
      const config = context.config; // Get config from context
      let targetSessionId: string;

      if (params.sessionId) {
        targetSessionId = params.sessionId;
        process.stderr.write(
          `[tool.createSession] Attempting to create/assign session with specified ID: ${targetSessionId}\n`
        );
      } else {
        targetSessionId = defaultSessionId;
        process.stderr.write(
          `[tool.createSession] Attempting to create/ensure default session (ID: ${targetSessionId})\n`
        );
      }

      let session: BrowserSession;
      if (targetSessionId === defaultSessionId) {
        session = await ensureDefaultSessionInternal(config);
      } else {
        session = await createNewBrowserSession(targetSessionId, config);
      }

      if (!session || !session.browser || !session.page || !session.sessionId) {
        throw new Error(
          `SessionManager failed to return a valid session object with actualSessionId for ID: ${targetSessionId}`
        );
      }

      context.currentSessionId = targetSessionId;
      process.stderr.write(
        `[tool.createSession] Successfully ensured session. Internal ID: ${targetSessionId}, Actual ID: ${session.sessionId}\n`
      );

      return {
        content: [
          {
            type: "text",
            text: `https://www.browserbase.com/sessions/${session.sessionId}`,
          },
        ],
      };
    } catch (error: any) {
      process.stderr.write(
        `[tool.createSession] Action failed: ${
          error.message || String(error)
        }\n`
      );
      // Re-throw to be caught by Context.run's error handling for actions
      throw new Error(
        `Failed to create Browserbase session: ${
          error.message || String(error)
        }`
      );
    }
  };

  // Return the ToolResult structure expected by Context.run
  return {
    action: action, 
    captureSnapshot: false, 
    code: [],  
    waitForNetwork: false, 
  };
}

// Define tool using handle
const createSessionTool: Tool<typeof CreateSessionInputSchema> = {
  capability: "core", // Add capability
  schema: createSessionSchema,
  handle: handleCreateSession,
};

// Export the single tool object as default
export default createSessionTool; 