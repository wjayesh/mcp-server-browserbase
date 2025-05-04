import { z } from "zod";
import type { Tool, ToolSchema, ToolContext, ToolResult } from "./tool.js";
import { createSuccessResult, createErrorResult } from "./toolUtils.js";
import type { Context } from "../context.js";
import type { ToolActionResult } from "../context.js";

/**
 * Handle adding cookies to the browser session
 */
export async function handleAddCookies(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  try {
    if (!args.cookies || !Array.isArray(args.cookies) || args.cookies.length === 0) {
      return {
        content: [{ type: "text", text: "Missing or invalid required argument: cookies (must be a non-empty array)" }],
        isError: true,
      };
    }

    // Get the browser context for this page
    const context = page.context();
    
    // Add each cookie to the context
    await context.addCookies(args.cookies);
    
    console.error(`Added ${args.cookies.length} cookies to session ${targetSessionId}`);
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully added ${args.cookies.length} cookies to session ${targetSessionId}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to add cookies to session ${targetSessionId}: ${(error as Error).message}`
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to add cookies: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle deleting cookies from the browser session
 */
export async function handleDeleteCookies(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  try {
    // Get the browser context for this page
    const context = page.context();
    
    // If 'all' flag is true, clear all cookies
    if (args.all === true) {
      await context.clearCookies();
      console.error(`Cleared all cookies from session ${targetSessionId}`);
      return {
        content: [
          {
            type: "text",
            text: `Successfully cleared all cookies from session ${targetSessionId}`,
          },
        ],
        isError: false,
      };
    }
    
    // Otherwise, expect an array of cookies to delete
    if (!args.cookies || !Array.isArray(args.cookies) || args.cookies.length === 0) {
      return {
        content: [
          { 
            type: "text", 
            text: "Missing required arguments: either 'all: true' or 'cookies' array must be provided" 
          }
        ],
        isError: true,
      };
    }
    
    // Get current cookies
    const currentCookies = await context.cookies();
    const initialCount = currentCookies.length;
    
    // For each cookie in the list, delete it (one by one)
    for (const cookieToDelete of args.cookies) {
      // Playwright doesn't have a direct "delete specific cookie" method
      // So we need to get all cookies, filter out the one we want to delete, and set the rest
      
      // Filter the cookies to exclude the one to delete
      const remainingCookies = currentCookies.filter(cookie => 
        !(cookie.name === cookieToDelete.name && 
          cookie.domain === cookieToDelete.domain &&
          (cookieToDelete.path ? cookie.path === cookieToDelete.path : true))
      );
      
      // If we found cookies to delete
      if (remainingCookies.length < currentCookies.length) {
        // Clear all cookies and re-add the remaining ones
        await context.clearCookies();
        
        // Re-add the remaining cookies
        if (remainingCookies.length > 0) {
          await context.addCookies(remainingCookies);
        }
        
        // Update our tracking array for subsequent operations
        currentCookies.length = 0;
        currentCookies.push(...remainingCookies);
      }
    }
    
    // Get the new count
    const finalCookies = await context.cookies();
    const deletedCount = initialCount - finalCookies.length;
    
    console.error(`Deleted ${deletedCount} cookies from session ${targetSessionId}`);
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully deleted ${deletedCount} out of ${args.cookies.length} specified cookies from session ${targetSessionId}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to delete cookies from session ${targetSessionId}: ${(error as Error).message}`
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to delete cookies: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Gets all cookies from the browser session and returns them
 */
export async function handleGetCookies(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  try {
    // Get the browser context for this page
    const context = page.context();
    
    // Get all cookies (optionally filtered by URLs)
    const urls = args.urls || [];
    const cookies = await context.cookies(urls);
    
    console.error(`Retrieved ${cookies.length} cookies from session ${targetSessionId}`);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(cookies, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to get cookies from session ${targetSessionId}: ${(error as Error).message}`
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to get cookies: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

// --- Tool: Add Cookies ---
const CookieSchema = z.object({
  name: z.string().describe("Cookie name"),
  value: z.string().describe("Cookie value"),
  domain: z.string().describe("Cookie domain (required)"),
  path: z.string().describe("Cookie path").default("/"),
  expires: z.number().optional().describe("Cookie expiration time in seconds since epoch, or -1 for session cookies"),
  httpOnly: z.boolean().optional().describe("Whether the cookie is HTTP-only"),
  secure: z.boolean().optional().describe("Whether the cookie is secure"),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional().describe("Cookie same-site policy: 'Strict', 'Lax', or 'None'"),
});

const AddCookiesInputSchema = z.object({
  cookies: z.array(CookieSchema).describe("Array of cookie objects to add to the browser"),
});
type AddCookiesInput = z.infer<typeof AddCookiesInputSchema>;

const addCookiesSchema: ToolSchema<typeof AddCookiesInputSchema> = {
  name: "browserbase_cookies_add",
  description: "Add cookies to the current browser session",
  inputSchema: AddCookiesInputSchema,
};

async function handleAddCookies(
  context: Context,
  params: AddCookiesInput
): Promise<ToolResult> {
  try {
    if (!params.cookies || params.cookies.length === 0) {
      throw new Error("Missing or invalid required argument: cookies (must be a non-empty array)");
    }

    // Get the active page
    const page = await context.getPage();
    
    // Get the browser context for this page
    const browserContext = page.context();
    
    // Add each cookie to the context
    await browserContext.addCookies(params.cookies);
    
    console.error(`Added ${params.cookies.length} cookies to session`);
    
    const result: ToolActionResult = {
      content: [
        {
          type: "text",
          text: `Successfully added ${params.cookies.length} cookies to the browser session`,
        },
      ],
    };

    return {
      resultOverride: result,
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  } catch (error: any) {
    console.error(`AddCookies handle failed: ${error.message || error}`);
    throw new Error(`Failed to add cookies: ${error.message || error}`);
  }
}

// --- Tool: Delete Cookies ---
const CookieIdentifierSchema = z.object({
  name: z.string().describe("Cookie name to delete"),
  domain: z.string().describe("Cookie domain (required for proper matching)"),
  path: z.string().describe("Cookie path").default("/"),
});

const DeleteCookiesInputSchema = z.object({
  cookies: z.array(CookieIdentifierSchema).optional().describe("Array of cookie identifiers to delete"),
  all: z.boolean().default(false).describe("If true, delete all cookies (ignores the cookies array)"),
});
type DeleteCookiesInput = z.infer<typeof DeleteCookiesInputSchema>;

const deleteCookiesSchema: ToolSchema<typeof DeleteCookiesInputSchema> = {
  name: "browserbase_cookies_delete",
  description: "Delete specific cookies from the current browser session",
  inputSchema: DeleteCookiesInputSchema,
};

async function handleDeleteCookies(
  context: Context,
  params: DeleteCookiesInput
): Promise<ToolResult> {
  try {
    // Get the active page
    const page = await context.getPage();
    
    // Get the browser context for this page
    const browserContext = page.context();
    
    // If 'all' flag is true, clear all cookies
    if (params.all === true) {
      await browserContext.clearCookies();
      console.error("Cleared all cookies from session");
      
      const result: ToolActionResult = {
        content: [
          {
            type: "text",
            text: "Successfully cleared all cookies from the browser session",
          },
        ],
      };

      return {
        resultOverride: result,
        code: [],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
    
    // Otherwise, expect an array of cookies to delete
    if (!params.cookies || params.cookies.length === 0) {
      throw new Error("Missing required arguments: either 'all: true' or non-empty 'cookies' array must be provided");
    }
    
    // Get current cookies
    const currentCookies = await browserContext.cookies();
    const initialCount = currentCookies.length;
    
    // For each cookie in the list, delete it (one by one)
    for (const cookieToDelete of params.cookies) {
      // Filter the cookies to exclude the one to delete
      const remainingCookies = currentCookies.filter((cookie: any) => 
        !(cookie.name === cookieToDelete.name && 
          cookie.domain === cookieToDelete.domain &&
          (cookieToDelete.path ? cookie.path === cookieToDelete.path : true))
      );
      
      // If we found cookies to delete
      if (remainingCookies.length < currentCookies.length) {
        // Clear all cookies and re-add the remaining ones
        await browserContext.clearCookies();
        
        // Re-add the remaining cookies
        if (remainingCookies.length > 0) {
          await browserContext.addCookies(remainingCookies);
        }
        
        // Update our tracking array for subsequent operations
        currentCookies.length = 0;
        currentCookies.push(...remainingCookies);
      }
    }
    
    // Get the new count
    const finalCookies = await browserContext.cookies();
    const deletedCount = initialCount - finalCookies.length;
    
    console.error(`Deleted ${deletedCount} cookies from session`);
    
    const result: ToolActionResult = {
      content: [
        {
          type: "text",
          text: `Successfully deleted ${deletedCount} out of ${params.cookies.length} specified cookies`,
        },
      ],
    };

    return {
      resultOverride: result,
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  } catch (error: any) {
    console.error(`DeleteCookies handle failed: ${error.message || error}`);
    throw new Error(`Failed to delete cookies: ${error.message || error}`);
  }
}

// --- Tool: Get Cookies ---
const GetCookiesInputSchema = z.object({
  urls: z.array(z.string()).optional().describe("Optional list of URLs to get cookies for (if empty, gets all cookies)"),
});
type GetCookiesInput = z.infer<typeof GetCookiesInputSchema>;

const getCookiesSchema: ToolSchema<typeof GetCookiesInputSchema> = {
  name: "browserbase_cookies_get",
  description: "Get all cookies from the current browser session",
  inputSchema: GetCookiesInputSchema,
};

async function handleGetCookies(
  context: Context,
  params: GetCookiesInput
): Promise<ToolResult> {
  try {
    // Get the active page
    const page = await context.getPage();
    
    // Get the browser context for this page
    const browserContext = page.context();
    
    // Get all cookies (optionally filtered by URLs)
    const urls = params.urls || [];
    const cookies = await browserContext.cookies(urls);
    
    console.error(`Retrieved ${cookies.length} cookies from session`);
    
    const result: ToolActionResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify(cookies, null, 2),
        },
      ],
    };

    return {
      resultOverride: result,
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  } catch (error: any) {
    console.error(`GetCookies handle failed: ${error.message || error}`);
    throw new Error(`Failed to get cookies: ${error.message || error}`);
  }
}

// Define tools
const addCookiesTool: Tool<typeof AddCookiesInputSchema> = {
  capability: "core",
  schema: addCookiesSchema,
  handle: handleAddCookies,
};

const deleteCookiesTool: Tool<typeof DeleteCookiesInputSchema> = {
  capability: "core",
  schema: deleteCookiesSchema,
  handle: handleDeleteCookies,
};

const getCookiesTool: Tool<typeof GetCookiesInputSchema> = {
  capability: "core",
  schema: getCookiesSchema,
  handle: handleGetCookies,
};

// Export as an array of tools
export default [addCookiesTool, deleteCookiesTool, getCookiesTool]; 