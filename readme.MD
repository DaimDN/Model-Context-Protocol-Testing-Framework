# Playwright MCP Server

A Model Context Protocol (MCP) server that provides Playwright browser
automation capabilities for VS Code Copilot agent mode. Built from scratch
without using the official MCP SDK to meet corporate compliance requirements.

## Features

- Launch and manage multiple browser instances (Chromium, Firefox, WebKit)
- Create and manage browser contexts and pages
- Navigate to URLs and interact with web elements
- Take screenshots and extract text content
- Execute JavaScript in page context
- Wait for elements and handle dynamic content
- Full cleanup and resource management

## Installation

1. Clone this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Install Playwright browsers:

   ```bash
   npx playwright install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Running the Server

```bash
npm start
```

The server communicates via JSON-RPC over stdin/stdout, following the MCP
protocol specification.

### Available Tools

#### Browser Management

- `launch_browser` - Launch a browser instance
- `create_context` - Create a new browser context
- `create_page` - Create a new page in a context
- `close_page` - Close a page
- `close_context` - Close a context
- `close_browser` - Close a browser

#### Navigation & Interaction

- `navigate` - Navigate to a URL
- `click` - Click on an element
- `fill` - Fill an input field
- `get_text` - Get text content of an element
- `wait_for_selector` - Wait for an element to appear

#### Advanced Features

- `screenshot` - Take screenshots
- `evaluate` - Execute JavaScript in page context

### Example Usage

```javascript
// Launch a browser
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "launch_browser",
    "arguments": {
      "browser": "chromium",
      "headless": true,
      "browserId": "main-browser"
    }
  }
}

// Create a context
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_context",
    "arguments": {
      "browserId": "main-browser",
      "contextId": "main-context",
      "viewport": { "width": 1920, "height": 1080 }
    }
  }
}

// Create a page
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_page",
    "arguments": {
      "contextId": "main-context",
      "pageId": "main-page"
    }
  }
}

// Navigate to a URL
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "navigate",
    "arguments": {
      "pageId": "main-page",
      "url": "https://example.com"
    }
  }
}
```

## VS Code Copilot Integration

To use this server with VS Code Copilot agent mode:

1. Add the server configuration to your VS Code settings or MCP client
   configuration
2. The server will be available as a tool provider for Copilot agents
3. Copilot can now use Playwright automation capabilities in its responses

## Architecture

The server is built with:

- TypeScript for type safety
- Playwright for browser automation
- JSON-RPC 2.0 for communication
- Resource management for cleanup

## Error Handling

The server includes comprehensive error handling:

- Validates tool parameters
- Manages browser resources
- Provides detailed error messages
- Handles graceful shutdown

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
