import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createNewBrowserSession } from "../sessionManager.js"; // Need the underlying function
import { z } from "zod"; // Import Zod
import type { InputType, Tool, ToolContext, ToolSchema } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";

// --- Tool: browserbase_create_session ---

// 1. Define Zod Schema
const CreateSessionInputSchema = z.object({
    sessionId: z.string()
        .optional()
        .describe("A unique ID for the session (optional, uses a generated ID if not provided)"),
});
// 2. Infer TS type
type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

// 3. Use typeof schema in generic
const createSessionSchema: ToolSchema<typeof CreateSessionInputSchema> = {
    name: "browserbase_create_session",
    description: "Create a new cloud browser session using Browserbase",
    inputSchema: CreateSessionInputSchema, // Assign Zod schema
};

// This tool doesn't need the page/browser context, but needs the core creation function
async function runCreateSession(context: ToolContext, args: CreateSessionInput): Promise<CallToolResult> {
    const { config } = context;
    const newSessionId = args.sessionId || `session_${Date.now()}`;
    const toolName = createSessionSchema.name;
    try {
        await createNewBrowserSession(newSessionId, config);
        return createSuccessResult(`Created new browser session with ID: ${newSessionId}`, toolName);
    } catch (error) {
        return createErrorResult(`Failed to create session '${newSessionId}': ${(error as Error).message}`, toolName);
    }
}

// 5. Use typeof schema in generic, define with { schema, run }
export const createSessionTool: Tool<typeof CreateSessionInputSchema> = {
    schema: createSessionSchema,
    run: runCreateSession,
};

// Export a function that returns the tool array, accepting the flag
export function session(captureSnapshot: boolean): Tool<any>[] {
    // Session management shouldn't capture snapshot
    return [createSessionTool];
}

// Default export is the function
export default session; 