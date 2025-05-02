// import { AccessibilitySnapshot, AccessibilityNode } from "@modelcontextprotocol/sdk/types.js"; // Type might not be exported

// Common state and helpers for tools, moved from handlers.ts

// Store latest snapshot per session - MOVED TO Context
// export const latestSnapshots = new Map<string, any>(); 

// findNodeByRef helper removed as interaction tools now use aria-ref selector directly. 

// No common state remains here for now.
export {}; // Ensure file is treated as a module 

import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InputType, Tool, ToolContext, ToolSchema } from "./tool.js";
import { createErrorResult, createSuccessResult } from "./toolUtils.js";
import type { Context } from '../context.js'; // Only needed for type checking
import { errors as PlaywrightErrors } from "playwright-core"; // Needed for error checking

// --- Tool: browser_wait ---
const WaitInputSchema = z.object({
    time: z.number().min(0).describe("Time in seconds"),
});
type WaitInput = z.infer<typeof WaitInputSchema>;

const waitSchema: ToolSchema<typeof WaitInputSchema> = {
    name: "browser_wait",
    description: "Wait for a specified time in seconds",
    inputSchema: WaitInputSchema,
};
async function runWait(context: ToolContext, args: WaitInput): Promise<CallToolResult> {
    const toolName = waitSchema.name;
    const timeInSeconds = args.time;
    const waitMs = Math.min(30000, timeInSeconds * 1000);
    try {
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return createSuccessResult(`Waited for ${waitMs / 1000} seconds.`, toolName);
    } catch (error) {
        return createErrorResult(`Wait failed: ${(error as Error).message}`, toolName);
    }
}
const waitTool: Tool<typeof WaitInputSchema> = { schema: waitSchema, run: runWait };

// --- Tool: browser_close ---
const CloseInputSchema = z.object({});
type CloseInput = z.infer<typeof CloseInputSchema>;
const closeSchema: ToolSchema<typeof CloseInputSchema> = {
    name: "browser_close",
    description: "Close the current page...",
    inputSchema: CloseInputSchema,
};
async function runClose(context: ToolContext, args: CloseInput): Promise<CallToolResult> {
    const { page, sessionId } = context;
    const toolName = closeSchema.name;
    if (!page) return createErrorResult("No active page", toolName);
    try {
        await page.close();
        return createSuccessResult(`Closed page`, toolName);
    } catch (error) {
        return createErrorResult(`Close failed: ${(error as Error).message}`, toolName);
    }
}
const closeTool: Tool<typeof CloseInputSchema> = { schema: closeSchema, run: runClose };

// --- Tool: browser_resize ---
const ResizeInputSchema = z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
});
type ResizeInput = z.infer<typeof ResizeInputSchema>;
const resizeSchema: ToolSchema<typeof ResizeInputSchema> = {
    name: "browser_resize",
    description: "Resize window...",
    inputSchema: ResizeInputSchema,
};
async function runResize(context: ToolContext, args: ResizeInput): Promise<CallToolResult> {
    const { page, sessionId } = context;
    const toolName = resizeSchema.name;
    if (!page) return createErrorResult("No active page", toolName);
    try {
        await page.setViewportSize({ width: args.width, height: args.height });
        return createSuccessResult(`Attempted resize`, toolName);
    } catch (error) {
        return createErrorResult(`Resize failed: ${(error as Error).message}`, toolName);
    }
}
const resizeTool: Tool<typeof ResizeInputSchema> = { schema: resizeSchema, run: runResize };

// Default export function returning the array of Tool objects
export function common(captureSnapshot: boolean): Tool<any>[] {
    // TODO: Use captureSnapshot to potentially configure tools if needed
    return [
        waitTool,
        closeTool,
        resizeTool,
    ];
}
export default common;

// Remove old direct exports
// export const waitTool: Tool<WaitInput> = { ... };
// export const closeTool: Tool<CloseInput> = { ... };
// export const resizeTool: Tool<ResizeInput> = { ... };
// export function common(): Tool[] { ... }; 