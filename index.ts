import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
    {
        name: "PostgreSQL MCP Server",
        version: "1.0.0",
        description: "A Model Context Protocol server for PostgreSQL",
    },
    {
        capabilities: {
            resources: {},
            tools: {}
        },
    }
)

async function runServer()
{
    const transport = new StdioServerTransport();
    await server.connect(transport)
}

runServer().catch(console.error)