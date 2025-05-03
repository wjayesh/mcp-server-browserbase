import { z } from 'zod';
import { Page, errors as PlaywrightErrors } from "playwright-core";
import type { Tool, ToolSchema, ToolContext, ToolResult } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";
import type { Context } from '../context.js';
import type { ToolActionResult } from '../context.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Define Zod schema
const NavigateInputSchema = z.object({
    url: z.string().url().describe("URL to navigate to"),
    sessionId: z.string().optional(),
});
type NavigateInput = z.infer<typeof NavigateInputSchema>;

const navigateSchema: ToolSchema<typeof NavigateInputSchema> = {
    name: "browserbase_navigate",
    description: "Navigate the current page to a new URL",
    inputSchema: NavigateInputSchema,
};

// Handle function for Navigate
async function handleNavigate(context: Context, params: NavigateInput): Promise<ToolResult> {
    const action = async (): Promise<ToolActionResult> => {
        const page = await context.getActivePage();
        if (!page) {
            throw new Error('No active page found for navigate');
        }
        try {
            await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return { content: [{ type: 'text', text: `Navigated to ${params.url}` }] };
        } catch (error) {
            console.error(`Navigate action failed: ${error}`);
            throw error; // Rethrow
        }
    };

    return {
        action,
        code: [], // Add code property
        captureSnapshot: true, // Navigation changes page state
        waitForNetwork: false, // page.goto handles waiting implicitly
    };
}

// Define tool using handle
const navigateTool: Tool<typeof NavigateInputSchema> = {
    capability: 'core', // Add capability
    schema: navigateSchema,
    handle: handleNavigate,
};

// Export the single tool object as default
export default [navigateTool]; // Export as an array containing the tool

// If you have multiple navigation tools (back, forward), group them:
// export const navigationTools: Tool[] = [navigateTool, backTool, forwardTool];

// TODO: Add handlers for navigate_back, navigate_forward if needed 