#!/usr/bin/env node

import {
	chromium,
	firefox,
	webkit,
	Browser,
	Page,
	BrowserContext,
} from "playwright";
import { readFileSync } from "fs";
import { join } from "path";

interface MCPRequest {
	jsonrpc: string;
	id?: string | number;
	method: string;
	params?: any;
}

interface MCPResponse {
	jsonrpc: string;
	id?: string | number;
	result?: any;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

interface MCPNotification {
	jsonrpc: string;
	method: string;
	params?: any;
}

class PlaywrightMCPServer {
	private browsers: Map<string, Browser> = new Map();
	private contexts: Map<string, BrowserContext> = new Map();
	private pages: Map<string, Page> = new Map();
	private requestId = 0;

	constructor() {
		this.setupStdio();
	}

	private setupStdio(): void {
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (data: string) => {
			const lines = data.trim().split("\n");
			for (const line of lines) {
				if (line.trim()) {
					try {
						const request: MCPRequest = JSON.parse(line);
						this.handleRequest(request);
					} catch (error) {
						this.sendError(null, -32700, "Parse error");
					}
				}
			}
		});
	}

	private async handleRequest(request: MCPRequest): Promise<void> {
		try {
			switch (request.method) {
				case "initialize":
					await this.handleInitialize(request);
					break;
				case "tools/list":
					await this.handleToolsList(request);
					break;
				case "tools/call":
					await this.handleToolCall(request);
					break;
				case "notifications/tools/list_changed":
					// Handle tool list changes if needed
					break;
				default:
					this.sendError(
						request.id,
						-32601,
						`Method not found: ${request.method}`,
					);
			}
		} catch (error) {
			this.sendError(
				request.id,
				-32603,
				`Internal error: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	}

	private async handleInitialize(request: MCPRequest): Promise<void> {
		const response: MCPResponse = {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: {
					tools: {},
				},
				serverInfo: {
					name: "playwright-mcp-server",
					version: "1.0.0",
				},
			},
		};
		this.sendResponse(response);
	}

	private async handleToolsList(request: MCPRequest): Promise<void> {
		const tools = [
			{
				name: "launch_browser",
				description: "Launch a browser instance (chromium, firefox, or webkit)",
				inputSchema: {
					type: "object",
					properties: {
						browser: {
							type: "string",
							enum: ["chromium", "firefox", "webkit"],
							description: "Browser type to launch",
						},
						headless: {
							type: "boolean",
							description: "Run browser in headless mode",
							default: true,
						},
						browserId: {
							type: "string",
							description: "Unique identifier for this browser instance",
						},
					},
					required: ["browser", "browserId"],
				},
			},
			{
				name: "create_context",
				description: "Create a new browser context",
				inputSchema: {
					type: "object",
					properties: {
						browserId: {
							type: "string",
							description: "Browser instance ID",
						},
						contextId: {
							type: "string",
							description: "Unique identifier for this context",
						},
						viewport: {
							type: "object",
							properties: {
								width: { type: "number" },
								height: { type: "number" },
							},
						},
						userAgent: {
							type: "string",
							description: "Custom user agent string",
						},
					},
					required: ["browserId", "contextId"],
				},
			},
			{
				name: "create_page",
				description: "Create a new page in a context",
				inputSchema: {
					type: "object",
					properties: {
						contextId: {
							type: "string",
							description: "Context ID to create page in",
						},
						pageId: {
							type: "string",
							description: "Unique identifier for this page",
						},
					},
					required: ["contextId", "pageId"],
				},
			},
			{
				name: "navigate",
				description: "Navigate to a URL",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID to navigate",
						},
						url: {
							type: "string",
							description: "URL to navigate to",
						},
					},
					required: ["pageId", "url"],
				},
			},
			{
				name: "click",
				description: "Click on an element",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID",
						},
						selector: {
							type: "string",
							description: "CSS selector or text to click",
						},
					},
					required: ["pageId", "selector"],
				},
			},
			{
				name: "fill",
				description: "Fill an input field",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID",
						},
						selector: {
							type: "string",
							description: "CSS selector of input field",
						},
						value: {
							type: "string",
							description: "Value to fill",
						},
					},
					required: ["pageId", "selector", "value"],
				},
			},
			{
				name: "get_text",
				description: "Get text content of an element",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID",
						},
						selector: {
							type: "string",
							description: "CSS selector of element",
						},
					},
					required: ["pageId", "selector"],
				},
			},
			{
				name: "screenshot",
				description: "Take a screenshot",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID",
						},
						path: {
							type: "string",
							description: "Path to save screenshot",
						},
						fullPage: {
							type: "boolean",
							description: "Take full page screenshot",
							default: false,
						},
					},
					required: ["pageId"],
				},
			},
			{
				name: "wait_for_selector",
				description: "Wait for an element to appear",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID",
						},
						selector: {
							type: "string",
							description: "CSS selector to wait for",
						},
						timeout: {
							type: "number",
							description: "Timeout in milliseconds",
							default: 30000,
						},
					},
					required: ["pageId", "selector"],
				},
			},
			{
				name: "evaluate",
				description: "Execute JavaScript in page context",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID",
						},
						script: {
							type: "string",
							description: "JavaScript code to execute",
						},
					},
					required: ["pageId", "script"],
				},
			},
			{
				name: "close_page",
				description: "Close a page",
				inputSchema: {
					type: "object",
					properties: {
						pageId: {
							type: "string",
							description: "Page ID to close",
						},
					},
					required: ["pageId"],
				},
			},
			{
				name: "close_context",
				description: "Close a browser context",
				inputSchema: {
					type: "object",
					properties: {
						contextId: {
							type: "string",
							description: "Context ID to close",
						},
					},
					required: ["contextId"],
				},
			},
			{
				name: "close_browser",
				description: "Close a browser instance",
				inputSchema: {
					type: "object",
					properties: {
						browserId: {
							type: "string",
							description: "Browser ID to close",
						},
					},
					required: ["browserId"],
				},
			},
		];

		const response: MCPResponse = {
			jsonrpc: "2.0",
			id: request.id,
			result: {
				tools,
			},
		};
		this.sendResponse(response);
	}

	private async handleToolCall(request: MCPRequest): Promise<void> {
		const { name, arguments: args } = request.params;

		try {
			let result: any;

			switch (name) {
				case "launch_browser":
					result = await this.launchBrowser(args);
					break;
				case "create_context":
					result = await this.createContext(args);
					break;
				case "create_page":
					result = await this.createPage(args);
					break;
				case "navigate":
					result = await this.navigate(args);
					break;
				case "click":
					result = await this.click(args);
					break;
				case "fill":
					result = await this.fill(args);
					break;
				case "get_text":
					result = await this.getText(args);
					break;
				case "screenshot":
					result = await this.screenshot(args);
					break;
				case "wait_for_selector":
					result = await this.waitForSelector(args);
					break;
				case "evaluate":
					result = await this.evaluate(args);
					break;
				case "close_page":
					result = await this.closePage(args);
					break;
				case "close_context":
					result = await this.closeContext(args);
					break;
				case "close_browser":
					result = await this.closeBrowser(args);
					break;
				default:
					throw new Error(`Unknown tool: ${name}`);
			}

			const response: MCPResponse = {
				jsonrpc: "2.0",
				id: request.id,
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify(result, null, 2),
						},
					],
				},
			};
			this.sendResponse(response);
		} catch (error) {
			this.sendError(
				request.id,
				-32603,
				`Tool execution failed: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	}

	private async launchBrowser(args: any): Promise<any> {
		const { browser: browserType, headless = true, browserId } = args;

		if (this.browsers.has(browserId)) {
			throw new Error(`Browser with ID ${browserId} already exists`);
		}

		let browser: Browser;
		switch (browserType) {
			case "chromium":
				browser = await chromium.launch({ headless });
				break;
			case "firefox":
				browser = await firefox.launch({ headless });
				break;
			case "webkit":
				browser = await webkit.launch({ headless });
				break;
			default:
				throw new Error(`Unsupported browser type: ${browserType}`);
		}

		this.browsers.set(browserId, browser);
		return { success: true, browserId, browserType };
	}

	private async createContext(args: any): Promise<any> {
		const { browserId, contextId, viewport, userAgent } = args;

		const browser = this.browsers.get(browserId);
		if (!browser) {
			throw new Error(`Browser with ID ${browserId} not found`);
		}

		if (this.contexts.has(contextId)) {
			throw new Error(`Context with ID ${contextId} already exists`);
		}

		const options: any = {};
		if (viewport) options.viewport = viewport;
		if (userAgent) options.userAgent = userAgent;

		const context = await browser.newContext(options);
		this.contexts.set(contextId, context);
		return { success: true, contextId };
	}

	private async createPage(args: any): Promise<any> {
		const { contextId, pageId } = args;

		const context = this.contexts.get(contextId);
		if (!context) {
			throw new Error(`Context with ID ${contextId} not found`);
		}

		if (this.pages.has(pageId)) {
			throw new Error(`Page with ID ${pageId} already exists`);
		}

		const page = await context.newPage();
		this.pages.set(pageId, page);
		return { success: true, pageId };
	}

	private async navigate(args: any): Promise<any> {
		const { pageId, url } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		await page.goto(url);
		return { success: true, url };
	}

	private async click(args: any): Promise<any> {
		const { pageId, selector } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		await page.click(selector);
		return { success: true, selector };
	}

	private async fill(args: any): Promise<any> {
		const { pageId, selector, value } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		await page.fill(selector, value);
		return { success: true, selector, value };
	}

	private async getText(args: any): Promise<any> {
		const { pageId, selector } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		const text = await page.textContent(selector);
		return { success: true, text };
	}

	private async screenshot(args: any): Promise<any> {
		const { pageId, path, fullPage = false } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		const options: any = { fullPage };
		if (path) options.path = path;

		const screenshot = await page.screenshot(options);
		return {
			success: true,
			path: path || "screenshot taken",
			size: screenshot.length,
		};
	}

	private async waitForSelector(args: any): Promise<any> {
		const { pageId, selector, timeout = 30000 } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		await page.waitForSelector(selector, { timeout });
		return { success: true, selector };
	}

	private async evaluate(args: any): Promise<any> {
		const { pageId, script } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		const result = await page.evaluate(script);
		return { success: true, result };
	}

	private async closePage(args: any): Promise<any> {
		const { pageId } = args;

		const page = this.pages.get(pageId);
		if (!page) {
			throw new Error(`Page with ID ${pageId} not found`);
		}

		await page.close();
		this.pages.delete(pageId);
		return { success: true, pageId };
	}

	private async closeContext(args: any): Promise<any> {
		const { contextId } = args;

		const context = this.contexts.get(contextId);
		if (!context) {
			throw new Error(`Context with ID ${contextId} not found`);
		}

		// Close all pages in this context
		for (const [pageId, page] of this.pages.entries()) {
			if (page.context() === context) {
				await page.close();
				this.pages.delete(pageId);
			}
		}

		await context.close();
		this.contexts.delete(contextId);
		return { success: true, contextId };
	}

	private async closeBrowser(args: any): Promise<any> {
		const { browserId } = args;

		const browser = this.browsers.get(browserId);
		if (!browser) {
			throw new Error(`Browser with ID ${browserId} not found`);
		}

		// Close all contexts and pages for this browser
		for (const [contextId, context] of this.contexts.entries()) {
			if (context.browser() === browser) {
				for (const [pageId, page] of this.pages.entries()) {
					if (page.context() === context) {
						await page.close();
						this.pages.delete(pageId);
					}
				}
				await context.close();
				this.contexts.delete(contextId);
			}
		}

		await browser.close();
		this.browsers.delete(browserId);
		return { success: true, browserId };
	}

	private sendResponse(response: MCPResponse): void {
		console.log(JSON.stringify(response));
	}

	private sendError(
		id: string | number | null | undefined | any,
		code: number,
		message: string,
		data?: any,
	): void {
		const error: MCPResponse = {
			jsonrpc: "2.0",
			id,
			error: {
				code,
				message,
				data,
			},
		};
		console.log(JSON.stringify(error));
	}

	private sendNotification(notification: MCPNotification): void {
		console.log(JSON.stringify(notification));
	}
}

// Graceful shutdown
process.on("SIGINT", async () => {
	console.error("Shutting down gracefully...");
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.error("Shutting down gracefully...");
	process.exit(0);
});

// Start the server
const server = new PlaywrightMCPServer();
console.error("Playwright MCP Server started");
