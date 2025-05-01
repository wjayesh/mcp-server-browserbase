// import { AccessibilitySnapshot, AccessibilityNode } from "@modelcontextprotocol/sdk/types.js"; // Type might not be exported

// Common state and helpers for tools, moved from handlers.ts

// Store latest snapshot per session
export const latestSnapshots = new Map<string, any>(); // Use 'any' if type is unavailable

// findNodeByRef helper removed as interaction tools now use aria-ref selector directly. 