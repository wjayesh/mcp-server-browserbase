import { Page } from "playwright-core";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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