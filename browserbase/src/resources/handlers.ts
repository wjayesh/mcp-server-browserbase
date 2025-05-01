import {
  ReadResourceRequest,
  Resource,
  ResourceContents,
} from "@modelcontextprotocol/sdk/types.js";

// Global state for screenshot resources
export const screenshots = new Map<string, string>();

// --- List Resources Handler ---
export async function handleListResources(): Promise<{ resources: Resource[] }> {
  console.error("Handling ListResources request.");
  const resourceList = Array.from(screenshots.keys()).map((name) => ({
    uri: `screenshot://${name}`,
    mimeType: "image/png",
    name: `Screenshot: ${name}`,
  }));
  console.error(`Returning ${resourceList.length} screenshot resources.`);
  return { resources: resourceList };
}

// --- Read Resource Handler ---
export async function handleReadResource(
  request: ReadResourceRequest,
): Promise<{ contents: ResourceContents[] }> {
  const uri = request.params.uri.toString();
  console.error(`Handling ReadResource request for URI: ${uri}`);
  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshotBase64 = screenshots.get(name);
    if (screenshotBase64) {
      console.error(`Found screenshot resource: ${name}`);
      return {
        contents: [
          {
            uri,
            mimeType: "image/png",
            blob: screenshotBase64,
          },
        ],
      };
    } else {
      console.error(`Screenshot resource not found: ${name}`);
      throw new Error(`Resource not found: ${uri}`);
    }
  }
  console.error(`Resource URI format not recognized: ${uri}`);
  throw new Error(`Resource not found or format not supported: ${uri}`);
} 