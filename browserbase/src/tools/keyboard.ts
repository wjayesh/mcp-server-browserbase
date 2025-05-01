import { Page } from "playwright-core";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { errors as PlaywrightErrors } from "playwright-core";

// Press Key handler
export async function handlePressKey(page: Page, args: any, targetSessionId: string): Promise<CallToolResult> {
  if (!args.key) {
    return {
      content: [{ type: "text", text: "Missing required argument: key" }],
      isError: true,
    };
  }
  try {
    const keyToPress = args.key;
    if (args.selector) {
      console.error(
        `Attempting to press key '${keyToPress}' on selector '${args.selector}' in session ${targetSessionId}`,
      );
      await page.waitForSelector(args.selector, {
        state: "visible",
        timeout: 15000,
      });
      await page.press(args.selector, keyToPress, { timeout: 5000 });
      console.error(
        `Pressed key '${keyToPress}' on '${args.selector}' successfully in session ${targetSessionId}.`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Pressed key '${keyToPress}' on element matching selector: ${args.selector} in session ${targetSessionId}`,
          },
        ],
        isError: false,
      };
    } else {
      console.error(
        `Attempting to press key '${keyToPress}' globally in session ${targetSessionId}`,
      );
      await page.keyboard.press(keyToPress);
      console.error(
        `Pressed key '${keyToPress}' globally successfully in session ${targetSessionId}.`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Pressed key '${keyToPress}' globally in session ${targetSessionId}`,
          },
        ],
        isError: false,
      };
    }
  } catch (error) {
    console.error(
      `Failed to press key '${args.key}' ${args.selector ? "on selector " + args.selector : "globally"} in session ${targetSessionId}: ${(error as Error).message}`,
    );
    let errorMessage = `Failed to press key "${args.key}" ${args.selector ? 'on element matching selector "' + args.selector + '"' : "globally"} in session ${targetSessionId}.`;
    if (error instanceof PlaywrightErrors.TimeoutError) {
      errorMessage +=
        " Reason: Timeout waiting for element or key press action.";
    } else {
      errorMessage += ` Reason: ${(error as Error).message}`;
    }
    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true,
    };
  }
} 