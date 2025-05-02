import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InputType, Tool, ToolContext, ToolSchema } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";
import type { Context } from '../context.js';

// Define Zod schema
const NavigateInputSchema = z.object({
    url: z.string().url().describe("URL"),
    sessionId: z.string().optional().describe("Session ID"), 
});
type NavigateInput = z.infer<typeof NavigateInputSchema>;

const navigateSchema: ToolSchema<typeof NavigateInputSchema> = {
    name: "browserbase_navigate",
    description: "Navigate the current page to a new URL",
    inputSchema: NavigateInputSchema,
};

async function runNavigate(context: ToolContext, args: NavigateInput): Promise<CallToolResult> {
    const { page, sessionId } = context;
    const toolName = navigateSchema.name;
    if (!page) return createErrorResult("No active page", toolName);
    try {
        await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        return createSuccessResult(`Navigated to ${args.url}`, toolName);
    } catch (error) {
        return createErrorResult(`Navigation failed: ${(error as Error).message}`, toolName);
    }
}

const navigateTool: Tool<typeof NavigateInputSchema> = {
    schema: navigateSchema,
    run: runNavigate,
};

// Export factory function
export function navigate(captureSnapshot: boolean): Tool<any>[] {
    return [navigateTool];
}
export default navigate;

// If you have multiple navigation tools (back, forward), group them:
// export const navigationTools: Tool[] = [navigateTool, backTool, forwardTool];

// TODO: Add handlers for navigate_back, navigate_forward if needed 