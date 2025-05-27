import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";

// This is the entry point for the PostgreSQL MCP server.
// It initializes the server and connects it to the standard input/output transport.
// You can extend the server with resources and tools as needed.
// For example, you can add a resource for managing PostgreSQL connections or queries.
// You can also add tools for executing SQL commands or managing database schemas.
// The server will listen for requests and respond according to the Model Context Protocol specifications.
// You can run this server using Node.js and it will communicate with clients using the Model Context Protocol.

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

const args = process.argv.slice(2)
if (args.length === 0) {
    console.error("Please provide the database connection string as an argument.")
    process.exit(1);
}

const databaseUrl = args[0];

const resourceBaseUrl = new URL(databaseUrl)
resourceBaseUrl.protocol = "postgres:"; // Change the protocol to postgres
resourceBaseUrl.password = "";


// Create a PostgreSQL connection pool using the provided connection string
const pool = new pg.Pool(
    {
        connectionString: databaseUrl,
    }
)

const SCHEMA_PATH = "scema"

// Register a resource handler for listing database tables from 'public' schema
server.setRequestHandler(ListResourcesRequestSchema, async () =>
{
    const client = await pool.connect()

    try {
        const result = await client.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        )

        return {
            resources: result.rows.map((row) => ({
                uri: new URL(`${row.table_name}`, resourceBaseUrl).href,
                mimeType: "application/json",
                name: `"${row.table_name}" database schema`,
            }))
        }
    } finally {
        client.release();
    }
})

// Register a resource handler for reading a specific database table schema
server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
{
    const resourceUrl = new URL(request.params.uri)

    const pathComponents = resourceUrl.pathname.split("/")
    const schema = pathComponents.pop()
    const tableName = pathComponents.pop()

    if (schema !== SCHEMA_PATH) {
        throw new Error("Invalid resource URI")
    }

    const client = await pool.connect()

    try {

        const result = await client.query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
            [tableName],
        );

        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: "application/json",
                    text: JSON.stringify(result.rows, null, 2),
                },
            ],
        };
    } finally {
        client.release();
    }
})

// Register a tool for executing SQL queries against the PostgreSQL database
server.setRequestHandler(ListToolsRequestSchema, async () =>
{
    return {
        tools: [
            {
                name: "query",
                description: "Execute a SQL read-only query against the PostgreSQL database",
                inputSchema: {
                    type: "object",
                    properties: {
                        sql: { type: "string", description: "The SQL query to execute" }
                    },
                    required: ["sql"],
                }
            },
            {
                name: "insert",
                description: "Execute a SQL write query to insert a new row into a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table: { type: "string", description: "The name of the table to insert into" },
                        values: { type: "object", description: "The values to insert into the table" }
                    },
                    required: ["table", "values"],
                }
            },
            {
                name: "update",
                description: "Execute a SQL write query to update existing rows in a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table: { type: "string", description: "The name of the table to update" },
                        values: { type: "object", description: "The values to update in the table" },
                        where: { type: "string", description: "The WHERE clause to filter rows to update" }
                    },
                    required: ["table", "values", "where"],
                }
            },
            {
                name: "delete",
                description: "Execute a SQL write query to delete rows from a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table: { type: "string", description: "The name of the table to delete from" },
                        where: { type: "string", description: "The WHERE clause to filter rows to delete" }
                    },
                    required: ["table", "where"],
                }
            }
        ]
    }
})

// Handle tool requests for executing SQL queries
server.setRequestHandler(CallToolRequestSchema, async (request) =>
{
    const client = await pool.connect();
    const name = request.params.name;
    const args = request.params.arguments as any;

    try {
        switch (name) {
            case "query": {
                await client.query("BEGIN TRANSACTION READ ONLY");
                const result = await client.query(args.sql);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
                    isError: false,
                };
            }

            case "insert": {
                const columns = Object.keys(args.values).map((key) => `"${key}"`).join(", ");
                const values = Object.values(args.values);
                const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
                const sql = `INSERT INTO "${args.table}" (${columns}) VALUES (${placeholders}) RETURNING *`;

                const result = await client.query(sql, values);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.rows[0], null, 2) }],
                    isError: false,
                };
            }

            case "update": {
                const setParts = Object.entries(args.values)
                    .map(([key], i) => `"${key}" = $${i + 1}`)
                    .join(", ");
                const values = Object.values(args.values);
                const sql = `UPDATE "${args.table}" SET ${setParts} WHERE ${args.where} RETURNING *`;

                const result = await client.query(sql, values);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
                    isError: false,
                };
            }

            case "delete": {
                const sql = `DELETE FROM "${args.table}" WHERE ${args.where} RETURNING *`;
                const result = await client.query(sql);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
                    isError: false,
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    } finally {
        await client.query("ROLLBACK").catch(() => { });
        client.release();
    }
});


async function runServer()
{
    const transport = new StdioServerTransport();
    await server.connect(transport)
}

runServer().catch(console.error)