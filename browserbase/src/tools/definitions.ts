import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Tool Definitions
export const TOOLS: Tool[] = [
  {
    // Kept as browserbase_* as it's specific to this multi-session implementation
    name: "browserbase_create_session",
    description: "Create a new cloud browser session using Browserbase",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "A unique ID for the session (optional, uses a generated ID if not provided)",
        },
      },
      required: [],
    },
  },
  {
    // Renamed from browserbase_navigate
    name: "browserbase_navigate",
    description: "Navigate to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["url"],
    },
  },
  {
    // NEW: Standard MCP snapshot tool
    name: "browserbase_snapshot",
    description:
      "Capture accessibility snapshot of the current page. Used to get 'ref' values for other actions.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: [],
    },
  },
  {
    // Renamed from browserbase_take_screenshot and schema updated
    name: "browserbase_take_screenshot",
    description:
      "Take a screenshot of the current page or element. Use browser_snapshot for actions.",
    inputSchema: {
      type: "object",
      properties: {
        raw: {
          type: "boolean",
          description:
            "Whether to return without compression (PNG format). Default false (JPEG).",
          default: false,
        },
        element: {
          type: "string",
          description:
            "Human-readable element description (requires ref). If omitted, screenshots viewport.",
        },
        ref: {
          type: "string",
          description:
            "Exact target element reference from browser_snapshot (requires element). If omitted, screenshots viewport.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: [], // All args are optional or have defaults
    },
  },
  {
    // Renamed from browserbase_click (still uses selector internally for now)
    name: "browserbase_click",
    description:
      "Click an element on the page (uses 'element' description as selector, ignores snapshot 'ref').",
    inputSchema: {
      type: "object",
      properties: {
        // Uses the element description string as a selector for now.
        element: {
          type: "string",
          description:
            "Human-readable element description (used as selector, e.g., 'Login button')",
        },
        ref: {
          type: "string",
          description:
            "Exact target element reference from browserbase_snapshot (currently ignored)",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["element", "ref"],
    },
  },
  {
    // NEW: Standard MCP tool (placeholder)
    name: "browserbase_drag",
    description:
      "Perform drag and drop between two elements (requires snapshot ref - NOT IMPLEMENTED).",
    inputSchema: {
      type: "object",
      properties: {
        startElement: {
          type: "string",
          description:
            "Human-readable source element description (requires startRef).",
        },
        startRef: {
          type: "string",
          description: "Exact source element reference from browser_snapshot.",
        },
        endElement: {
          type: "string",
          description:
            "Human-readable target element description (requires endRef).",
        },
        endRef: {
          type: "string",
          description: "Exact target element reference from browser_snapshot.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["startElement", "startRef", "endElement", "endRef"],
    },
  },
  {
    // NEW: Standard MCP tool (placeholder)
    name: "browserbase_hover",
    description:
      "Hover over element on page (requires snapshot ref - NOT IMPLEMENTED).",
    inputSchema: {
      type: "object",
      properties: {
        element: {
          type: "string",
          description: "Human-readable element description (requires ref).",
        },
        ref: {
          type: "string",
          description: "Exact target element reference from browser_snapshot.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["element", "ref"],
    },
  },
  {
    // Renamed from browserbase_type, updated schema (still uses selector internally for now)
    name: "browserbase_type",
    description:
      "Type text into editable element (uses 'element' description as selector, ignores snapshot 'ref').",
    inputSchema: {
      type: "object",
      properties: {
        // Uses the element description string as a selector for now.
        element: {
          type: "string",
          description:
            "Human-readable element description (used as selector, e.g., 'Username input')",
        },
        ref: {
          type: "string",
          description:
            "Exact target element reference from browserbase_snapshot (currently ignored)",
        },
        text: { type: "string", description: "Text to type" },
        submit: {
          type: "boolean",
          description: "Whether to submit entered text (press Enter after)",
          default: false,
        },
        slowly: {
          type: "boolean",
          description:
            "Whether to type one character at a time. Default false.",
          default: false,
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["element", "ref", "text"],
    },
  },
  {
    // NEW: Standard MCP tool (placeholder)
    name: "browserbase_select_option",
    description:
      "Select an option in a dropdown (requires snapshot ref - NOT IMPLEMENTED).",
    inputSchema: {
      type: "object",
      properties: {
        element: {
          type: "string",
          description: "Human-readable element description (requires ref).",
        },
        ref: {
          type: "string",
          description: "Exact target element reference from browser_snapshot.",
        },
        values: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of values to select in the dropdown (single or multiple).",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["element", "ref", "values"],
    },
  },
  {
    // Renamed from browserbase_press_key
    name: "browserbase_press_key",
    description:
      "Press a specific key (e.g., Enter, Tab) on a selected element or globally.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS or Playwright selector for the target element (optional, presses key globally if omitted)",
        },
        key: {
          type: "string",
          description:
            "The key to press (e.g., 'Enter', 'Tab', 'ArrowDown', 'a', 'Shift+A'). See Playwright key documentation.",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: ["key"], // Selector is optional
    },
  },
  {
    // Kept as browserbase_*, as it's a custom utility
    name: "browserbase_get_text",
    description:
      "Extract all text content from the current page or a specific element (uses selector).",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS or Playwright selector to get text from a specific element",
        },
        sessionId: {
          type: "string",
          description: "Target session ID (optional, defaults to 'default')",
        },
      },
      required: [], // selector is optional
    },
  },
  // Other standard tools like browser_tab_*, browser_navigate_back/forward etc.
  // could be added here if needed, potentially wrapping existing Playwright functions.
]; 