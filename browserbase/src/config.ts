// Define the structure for configuration
export interface Config {
    browserbaseApiKey: string;
    browserbaseProjectId: string;
    // Add other configuration options here later if needed
}

// Function to load and validate configuration (currently from environment variables)
export function resolveConfig(): Config {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;

    if (!apiKey) {
        throw new Error("BROWSERBASE_API_KEY environment variable is required");
    }
    if (!projectId) {
        throw new Error("BROWSERBASE_PROJECT_ID environment variable is required");
    }

    // Load config from environment variables or defaults
    const config: Config = {
        browserbaseApiKey: apiKey,
        browserbaseProjectId: projectId,
    };

    return config;
} 