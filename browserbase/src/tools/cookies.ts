import { z } from "zod";
import { defineTool, type Tool, type ToolSchema, type ToolResult } from "./tool.js";
import type { Context, ToolActionResult } from "../context.js";
import type { Page, Cookie } from "playwright-core";

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
  const action = async (): Promise<ToolActionResult> => {
    if (!params.cookies || params.cookies.length === 0) {
      throw new Error("Missing or invalid required argument: cookies (must be a non-empty array)");
    }

    const page = await context.getActivePage();
    if (!page) throw new Error("No active page found");

    const browserContext = page.context();
    await browserContext.addCookies(params.cookies);
    console.error(`Added ${params.cookies.length} cookies to session`);

    return {
      content: [
        {
          type: "text",
          text: `Successfully added ${params.cookies.length} cookies to the browser session`,
        },
      ],
    };
  };

  return {
      action,
      code: [`// Add ${params.cookies.length} cookies`],
      captureSnapshot: false,
      waitForNetwork: false,
  };
}

// --- Tool: Get Cookies ---
const GetCookiesInputSchema = z.object({
  urls: z.array(z.string()).optional().describe("Optional list of URLs to get cookies for (if empty, gets all cookies)"),
});
type GetCookiesInput = z.infer<typeof GetCookiesInputSchema>;

const getCookiesSchema: ToolSchema<typeof GetCookiesInputSchema> = {
  name: "browserbase_cookies_get",
  description: "Get cookies from the current browser session, optionally filtered by URL",
  inputSchema: GetCookiesInputSchema,
};

async function handleGetCookies(
  context: Context,
  params: GetCookiesInput
): Promise<ToolResult> {
  const action = async (): Promise<ToolActionResult> => {
    const page = await context.getActivePage();
    if (!page) throw new Error("No active page found");

    const browserContext = page.context();
    const urls = params.urls || [];
    const cookies = await browserContext.cookies(urls);
    console.error(`Retrieved ${cookies.length} cookies from session`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(cookies, null, 2), // Return cookies as JSON string
        },
      ],
    };
  };

   return {
      action,
      code: [`// Get cookies (URLs: ${params.urls ? params.urls.length : 'all'})`],
      captureSnapshot: false,
      waitForNetwork: false,
  };
}

// Define tools using defineTool and the correct handle functions
const addCookiesTool = defineTool<typeof AddCookiesInputSchema>({
  capability: "core",
  schema: addCookiesSchema,
  handle: handleAddCookies,
});

const getCookiesTool = defineTool<typeof GetCookiesInputSchema>({
  capability: "core",
  schema: getCookiesSchema,
  handle: handleGetCookies,
});

// Export as an array of tools
export default [addCookiesTool, getCookiesTool]; 