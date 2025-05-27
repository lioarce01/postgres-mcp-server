# Postgres MCP Server

This project implements an MCP (Model-Context-Protocol) server for interacting with a PostgreSQL database using LLMs (Language Models). It allows structured access and manipulation of a PostgreSQL database through natural language.

## Features

- Expose a PostgreSQL interface to LLMs
- Use TypeScript and Node.js
- Compile with TypeScript
- Lightweight Docker image using multi-stage builds

## Requirements

- Docker
- PostgreSQL database

## Local Development

To run locally:

```bash
pnpm install
pnpm run build
node dist/index.js postgresql://<user>:<password>@<host>:<port>/<database>
```

Example:

```bash
node dist/index.js postgresql://postgres:admin@localhost:5432/postgres
```

## Docker Usage

### Build Docker Image

```bash
docker build -t postgres-mcp .
```

### Run with Docker

```bash
docker run --rm -it postgres-mcp postgresql://username:password@host.docker.internal:5432/mydb
```

### LLM Integration (e.g. with Claude or VSCode Copilot)

To configure the server for use with an LLM agent:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "postgres-mcp",
        "postgresql://username:password@host.docker.internal:5432/mydb"
      ]
    }
  }
}
```

## Project Structure

```text
├── index.ts
├── dist/
├── Dockerfile
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
└── pnpm-lock.yaml
```

## License

MIT
