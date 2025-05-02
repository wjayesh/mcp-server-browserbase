import { Page, errors as PlaywrightErrors } from "playwright-core";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { InputType, Tool, ToolContext, ToolSchema } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";

// --- Tool: browserbase_get_text ---

// 1. Define Zod Schema
const GetTextInputSchema = z.object({
    selector: z.string().optional().describe("Optional selector"),
    sessionId: z.string().optional().describe("Session ID"),
});
// 2. Infer TS Type
type GetTextInput = z.infer<typeof GetTextInputSchema>;

// 3. Use typeof schema in generic
const getTextSchema: ToolSchema<typeof GetTextInputSchema> = {
    name: "browserbase_get_text",
    description: "Extract text content...",
    inputSchema: GetTextInputSchema, // Assign Zod schema
};

// 4. Use inferred type for run args
async function runGetText(context: ToolContext, args: GetTextInput): Promise<CallToolResult> {
    const { page, sessionId } = context;
    const { selector } = args;
    const toolName = getTextSchema.name;
    if (!page) return createErrorResult("No active page", toolName);

    try {
        let rawContent: string | null;
        const targetLocator = selector ? page.locator(selector) : page.locator("body");
        
        await targetLocator.first().waitFor({ state: "attached", timeout: 15000 });

        if (selector) {
            rawContent = await targetLocator.first().innerText({ timeout: 10000 });
        } else {
            rawContent = await targetLocator.innerText({ timeout: 10000 });
        }

        if (rawContent === null) {
            return createErrorResult("No text content found", toolName);
        }

        // Basic cleaning (replace multiple spaces/newlines with single ones)
        const cleanedContent = rawContent.replace(/\s\s+/g, ' ').trim();
        
        const MAX_TEXT_LENGTH = 5000; // Consider making configurable
        const truncatedContent =
            cleanedContent.length > MAX_TEXT_LENGTH
                ? cleanedContent.substring(0, MAX_TEXT_LENGTH) + "... (truncated)"
                : cleanedContent;
                
        // Use success helper for the final text result
        return createSuccessResult(truncatedContent, toolName);
    } catch (error) {
        return createErrorResult(`Failed to extract content: ${error instanceof Error ? error.message : String(error)}`, toolName);
    }
}

// 5. Use typeof schema in generic, define with { schema, run }
export const getTextTool: Tool<typeof GetTextInputSchema> = {
    schema: getTextSchema,
    run: runGetText,
};

// Export a function that returns the tool array, accepting the flag
export function getText(captureSnapshot: boolean): Tool<any>[] {
    // Getting text shouldn't capture a snapshot, so flag is likely ignored
    return [getTextTool];
}

// Default export is the function
export default getText; 