import { Page } from "playwright-core";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function handleNavigate(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.url) {
    return {
      content: [{ type: "text", text: "Missing required argument: url" }],
      isError: true,
    };
  }
  console.error(`Navigating session ${targetSessionId} to ${args.url}`);
  await page.goto(args.url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  console.error(`Navigation successful for session ${targetSessionId}.`);
  return {
    content: [
      {
        type: "text",
        text: `Navigated session ${targetSessionId} to ${args.url}`,
      },
    ],
    isError: false,
  };
}

// TODO: Add handlers for navigate_back, navigate_forward if needed 