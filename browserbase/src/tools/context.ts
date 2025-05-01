import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Browserbase } from "@browserbasehq/sdk";

// Store contexts in memory 
// In a production app, these should be persisted to a database
const contexts = new Map<string, string>();

export async function handleCreateContext(args: any): Promise<CallToolResult> {
  try {
    const bb = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY!,
    });

    console.error("Creating new Browserbase context");
    const context = await bb.contexts.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    });

    console.error(`Successfully created context: ${context.id}`);
    
    // Store context ID with optional name if provided
    const contextName = args.name || context.id;
    contexts.set(contextName, context.id);
    
    return {
      content: [
        {
          type: "text",
          text: `Created new Browserbase context with ID: ${context.id}${args.name ? ` and name: ${args.name}` : ''}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to create Browserbase context: ${(error as Error).message}`
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to create Browserbase context: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleDeleteContext(args: any): Promise<CallToolResult> {
  try {
    if (!args.contextId && !args.name) {
      return {
        content: [{ type: "text", text: "Missing required argument: either contextId or name must be provided" }],
        isError: true,
      };
    }

    const bb = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY!,
    });

    // Resolve context ID either directly or by name
    let contextId = args.contextId;
    if (!contextId && args.name) {
      contextId = contexts.get(args.name);
      if (!contextId) {
        return {
          content: [{ type: "text", text: `Context with name "${args.name}" not found` }],
          isError: true,
        };
      }
    }

    console.error(`Deleting Browserbase context: ${contextId}`);
    
    // Delete from Browserbase API
    // The SDK may not have a delete method directly, so we use the REST API
    const response = await fetch(`https://api.browserbase.com/v1/contexts/${contextId}`, {
      method: 'DELETE',
      headers: {
        'X-BB-API-Key': process.env.BROWSERBASE_API_KEY!,
      },
    });
    
    if (response.status !== 204) {
      const errorText = await response.text();
      throw new Error(`Failed to delete context with status ${response.status}: ${errorText}`);
    }
    
    // Remove from local store
    if (args.name) {
      contexts.delete(args.name);
    }
    
    // Delete by ID too (in case it was stored multiple ways)
    for (const [name, id] of contexts.entries()) {
      if (id === contextId) {
        contexts.delete(name);
      }
    }
    
    console.error(`Successfully deleted context: ${contextId}`);
    return {
      content: [
        {
          type: "text",
          text: `Deleted Browserbase context with ID: ${contextId}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(
      `Failed to delete Browserbase context: ${(error as Error).message}`
    );
    return {
      content: [
        {
          type: "text", 
          text: `Failed to delete Browserbase context: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

// Helper function to get a context ID from name or direct ID
export function getContextId(nameOrId: string): string | undefined {
  // First check if it's a direct context ID
  if (nameOrId.length > 20) {  // Assumption: context IDs are long strings
    return nameOrId;
  }
  
  // Otherwise, look it up by name
  return contexts.get(nameOrId);
} 