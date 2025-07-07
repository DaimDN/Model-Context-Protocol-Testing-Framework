const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { chromium } = require("playwright");
const OpenAI = require("openai");
const path = require("path");
const dotenv = require("dotenv"); // For secure environment variable loading

// Load environment variables from .env file
// This is a crucial security improvement for API keys
dotenv.config();

// Centralized error handling for Playwright selectors
const PLAYWRIGHT_SELECTOR_STRATEGIES = [
	(page, selector) => page.locator(selector).first(), // Direct CSS selector
	(page, selector) => page.locator(`text=${selector}`).first(), // Text match
	(page, selector) => page.locator(`[aria-label*="${selector}" i]`).first(), // Aria-label (case-insensitive)
	(page, selector) => page.locator(`[title*="${selector}" i]`).first(), // Title attribute (case-insensitive)
	(page, selector) => page.locator(`[placeholder*="${selector}" i]`).first(), // Placeholder attribute (case-insensitive)
	(page, selector) => page.locator(`button:has-text("${selector}")`).first(), // Button with specific text
	(page, selector) => page.locator(`a:has-text("${selector}")`).first(), // Link with specific text
	(page, selector) => page.locator(`*:has-text("${selector}")`).first(), // Any element with specific text
];

class AIWebAutomationServer {
	constructor() {
		// --- Configuration & Initialization ---
		// Validate essential environment variables early
		if (!process.env.OPENAI_API_KEY) {
			console.error(
				"CRITICAL ERROR: OPENAI_API_KEY is not set. Please set it in your .env file.",
			);
			process.exit(1); // Exit if critical env var is missing
		}

		this.app = express();
		this.server = http.createServer(this.app);
		this.io = socketIo(this.server, {
			cors: {
				origin: process.env.CORS_ORIGIN || "*", // Use env var for CORS origin, default to *
				methods: ["GET", "POST"],
			},
		});
		this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

		// Browser and Page instances should be managed carefully
		this.browser = null;
		this.page = null;

		// Map to store active sockets and their associated browser/page instances
		// This is crucial for supporting multiple concurrent users/sessions
		this.activeSessions = new Map();

		// History of actions for test generation (per session)
		// Storing this directly on `this.actionHistory` would mix sessions
		// So, it needs to be session-specific. We'll adjust its usage below.

		// --- Setup Methods ---
		this.setupMiddleware();
		this.setupRoutes();
		this.setupSocketHandlers();

		// Bind 'this' to methods that will be used as callbacks
		this.handleUserMessage = this.handleUserMessage.bind(this);
		this.generatePlaywrightTest = this.generatePlaywrightTest.bind(this);
		this.handleSocketDisconnect = this.handleSocketDisconnect.bind(this);
		this.cleanupSession = this.cleanupSession.bind(this);
		this.initializeBrowser = this.initializeBrowser.bind(this);
	}

	/**
	 * Set up Express middleware.
	 * Added a health check endpoint.
	 */
	setupMiddleware() {
		this.app.use(express.static(path.join(__dirname, "public")));
		this.app.use(express.json());
		// Basic logging middleware for HTTP requests
		this.app.use((req, res, next) => {
			console.log(`[HTTP] ${req.method} ${req.url}`);
			next();
		});
	}

	/**
	 * Set up Express routes.
	 * Added a simple health check.
	 */
	setupRoutes() {
		this.app.get("/", (req, res) => {
			res.sendFile(path.join(__dirname, "public", "index.html"));
		});

		// Health check endpoint
		this.app.get("/health", (req, res) => {
			res.status(200).json({
				status: "healthy",
				uptime: process.uptime(),
				timestamp: new Date().toISOString(),
				playwrightBrowser: this.browser ? "active" : "inactive",
				activeSessions: this.activeSessions.size,
			});
		});
	}

	/**
	 * Set up Socket.IO event handlers.
	 * Improved session management for concurrent users.
	 */
	setupSocketHandlers() {
		this.io.on("connection", (socket) => {
			console.log(`[Socket.IO] Client connected: ${socket.id}`);

			// Initialize session data for the new client
			this.activeSessions.set(socket.id, {
				browser: null,
				page: null,
				actionHistory: [], // Action history is now per-session
			});

			// Emit a "connected" status back to the client
			this.emitStatus(socket, "✅ Connected to server", "connection_success");

			socket.on("user_message", async (data) => {
				await this.handleUserMessage(socket, data.message); // Pass socket to handler
			});

			socket.on("generate_test", async () => {
				await this.generatePlaywrightTest(socket);
			});

			socket.on("disconnect", () => {
				this.handleSocketDisconnect(socket);
			});

			// Optional: Error handling for socket itself
			socket.on("error", (err) => {
				console.error(`[Socket.IO Error] Socket ${socket.id}:`, err);
				this.emitStatus(socket, `❌ Socket error: ${err.message}`, "error");
			});
		});
	}

	/**
	 * Initialize Playwright browser for a specific session.
	 * @param {Socket} socket - The socket associated with the session.
	 */
	async initializeBrowser(socket) {
		const session = this.activeSessions.get(socket.id);
		if (!session) {
			console.error(`[Playwright] Session not found for socket ${socket.id}`);
			return;
		}

		if (!session.browser) {
			this.emitStatus(socket, "🚀 Initializing browser...", "browser_init");
			try {
				session.browser = await chromium.launch({
					headless: process.env.HEADLESS_BROWSER === "true", // Control headless via env var
					args: [
						"--no-sandbox",
						"--disable-setuid-sandbox",
						"--disable-dev-shm-usage", // Recommended for Docker/Linux environments
					],
				});
				session.page = await session.browser.newPage();
				this.setupPageEventListeners(socket, session.page); // Pass socket to listener setup
				this.emitStatus(socket, "✅ Browser initialized successfully");
			} catch (error) {
				this.emitStatus(
					socket,
					`❌ Failed to initialize browser: ${error.message}`,
					"error",
				);
				console.error(
					`[Playwright Error] Browser initialization failed for ${socket.id}:`,
					error,
				);
				// Clean up partially initialized session on error
				await this.cleanupSession(socket.id);
				throw error; // Re-throw to propagate the error
			}
		}
	}

	/**
	 * Set up Playwright page event listeners for a specific session.
	 * @param {Socket} socket - The socket associated with the session.
	 * @param {Page} page - The Playwright page instance.
	 */
	setupPageEventListeners(socket, page) {
		page.on("load", () => {
			this.emitStatus(socket, `📄 Page loaded: ${page.url()}`);
		});

		page.on("domcontentloaded", () => {
			this.emitStatus(socket, "🔧 DOM content loaded");
		});

		page.on("console", (msg) => {
			// Log browser console messages on the server for debugging
			console.log(`[Browser Console - ${socket.id}] ${msg.text()}`);
		});

		page.on("pageerror", (error) => {
			this.emitStatus(socket, `❌ Page error: ${error.message}`, "error");
			console.error(`[Playwright Error - ${socket.id}] Page error:`, error);
		});

		page.on("close", () => {
			this.emitStatus(socket, "🗑️ Browser page closed", "info");
			console.log(`[Playwright] Page closed for session ${socket.id}`);
			// Mark page as null in session if it gets closed unexpectedly
			const session = this.activeSessions.get(socket.id);
			if (session) {
				session.page = null;
			}
		});
	}

	/**
	 * Handles incoming user messages, orchestrating AI analysis and Playwright execution.
	 * @param {Socket} socket - The socket originating the message.
	 * @param {string} message - The user's command.
	 */
	async handleUserMessage(socket, message) {
		const session = this.activeSessions.get(socket.id);
		if (!session) {
			this.emitStatus(
				socket,
				"❌ Session not found. Please reconnect.",
				"error",
			);
			console.error(`[Server Error] Session not found for socket ${socket.id}`);
			return;
		}

		try {
			await this.initializeBrowser(socket); // Ensure browser is initialized for this session

			this.emitStatus(socket, "🤖 AI analyzing your request...");
			const currentUrl = session.page ? session.page.url() : "about:blank";
			const pageTitle = session.page
				? await session.page.title()
				: "No page loaded";

			const aiResponse = await this.analyzeUserIntent(
				socket, // Pass socket for potential AI-related status updates
				message,
				currentUrl,
				pageTitle,
			);

			// Add the AI's intended action to the session's action history
			session.actionHistory.push({ message, aiResponse });

			await this.executeAIActions(socket, aiResponse); // Pass socket to execution
		} catch (error) {
			this.emitStatus(
				socket,
				`❌ Global error processing message: ${error.message}`,
				"error",
			);
			console.error(
				`[Server Error] Error handling user message for ${socket.id}:`,
				error,
			);
			// Consider more granular error handling or recovery here,
			// e.g., if Playwright fails, try re-initializing.
		}
	}

	/**
	 * Uses OpenAI to analyze user intent and generate a structured action plan.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {string} message - The user's natural language command.
	 * @param {string} currentUrl - The current URL in the browser.
	 * @param {string} pageTitle - The current page title.
	 * @returns {Promise<Object>} A Promise that resolves to the AI's structured action response.
	 */
	async analyzeUserIntent(socket, message, currentUrl, pageTitle) {
		const systemPrompt = `You are an AI web automation assistant. Analyze the user's request and provide a structured JSON response for web automation. Always try to provide specific CSS selectors if possible, otherwise descriptive text.

Current Context:
- Current URL: ${currentUrl}
- Page Title: ${pageTitle}

User Message: "${message}"

Respond with a JSON object containing:
{
    "action": "navigate|click|type|wait|scroll|extract|analyze",
    "target": "URL or CSS selector or descriptive text",
    "value": "text to type or specific value (optional)",
    "description": "Human-readable summary of the action",
    "steps": ["detailed step 1", "detailed step 2"] // Granular steps for execution
}

Examples:
- "Open google.com": {"action": "navigate", "target": "https://google.com", "description": "Navigating to Google"}
- "Click the login button": {"action": "click", "target": "button:has-text('Login')", "description": "Clicking the login button"}
- "Type 'my_username' into the username field": {"action": "type", "target": "input[name='username']", "value": "my_username", "description": "Typing username"}
- "Extract all product prices": {"action": "extract", "target": ".product-price", "description": "Extracting product prices"}
- "Wait for 3 seconds": {"action": "wait", "target": "3000", "description": "Waiting for 3 seconds"}

Ensure your output is **only** the JSON object, without any surrounding text or markdown. Be specific and actionable. If a direct action isn't clear, use "analyze" to gather more information.`;

		try {
			const completion = await this.openai.chat.completions.create({
				model: "gpt-4-turbo-preview", // Use a more capable model if available
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: message },
				],
				response_format: { type: "json_object" }, // Explicitly request JSON
			});

			let responseContent = completion.choices[0].message.content;

			// Robust JSON parsing, even with response_format, sometimes LLMs can be tricky
			try {
				return JSON.parse(responseContent);
			} catch (parseError) {
				console.error(
					`[AI Parse Error] Attempting to fix JSON for socket ${socket.id}:`,
					parseError.message,
					"Raw response:",
					responseContent,
				);
				// Attempt a more lenient parse or regex extraction if direct parse fails
				const jsonMatch = responseContent.match(/{[\s\S]*}/);
				if (jsonMatch) {
					try {
						return JSON.parse(jsonMatch[0]);
					} catch (secondParseError) {
						this.emitStatus(
							socket,
							`❌ AI response format error. Could not parse JSON.`,
							"error",
						);
						console.error(
							`[AI Parse Error] Second parse attempt failed for socket ${socket.id}:`,
							secondParseError.message,
						);
						return {
							action: "error",
							target: "",
							value: "",
							description: "AI failed to produce valid JSON",
							steps: ["Please try rephrasing your request."],
						};
					}
				} else {
					this.emitStatus(
						socket,
						`❌ AI response format error. No JSON found.`,
						"error",
					);
					return {
						action: "error",
						target: "",
						value: "",
						description: "AI response was not JSON",
						steps: ["AI did not provide a structured JSON response."],
					};
				}
			}
		} catch (error) {
			this.emitStatus(
				socket,
				`❌ AI analysis failed: ${error.message}`,
				"error",
			);
			console.error(
				`[OpenAI Error] Failed to get completion for socket ${socket.id}:`,
				error.message,
			);
			return {
				action: "error",
				target: "",
				value: "",
				description: "AI analysis failed due to an API error",
				steps: ["Could not communicate with the AI service."],
			};
		}
	}

	/**
	 * Executes the actions prescribed by the AI.
	 * @param {Socket} socket - The socket for session context and status updates.
	 * @param {Object} aiResponse - The parsed AI action plan.
	 */
	async executeAIActions(socket, aiResponse) {
		const { action, target, value, description, steps } = aiResponse;
		const session = this.activeSessions.get(socket.id);
		if (!session || !session.page) {
			this.emitStatus(
				socket,
				"❌ Browser not initialized for this session.",
				"error",
			);
			return;
		}

		this.emitStatus(socket, `🎯 Plan: ${description}`);
		if (steps && steps.length > 0) {
			steps.forEach((step, index) => {
				this.emitStatus(socket, `📝 Step ${index + 1}: ${step}`);
			});
		}

		try {
			switch (action) {
				case "navigate":
					await this.handleNavigation(socket, session.page, target);
					break;
				case "click":
					await this.handleClick(socket, session.page, target);
					break;
				case "type":
					await this.handleType(socket, session.page, target, value);
					break;
				case "analyze":
					await this.handleAnalyze(socket, session.page, target);
					break;
				case "wait":
					await this.handleWait(socket, session.page, target);
					break;
				case "scroll":
					await this.handleScroll(socket, session.page, target);
					break;
				case "extract":
					await this.handleExtract(socket, session.page, target);
					break;
				case "error":
					this.emitStatus(
						socket,
						`❌ AI Action Error: ${description}`,
						"error",
					);
					break;
				default:
					this.emitStatus(socket, `❓ Unknown action: ${action}`, "warning");
			}
		} catch (error) {
			this.emitStatus(
				socket,
				`❌ Action "${action}" failed: ${error.message}`,
				"error",
			);
			console.error(
				`[Execution Error] Action "${action}" failed for ${socket.id}:`,
				error,
			);
		}
	}

	/**
	 * Handles navigation commands.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} url - The URL to navigate to.
	 */
	async handleNavigation(socket, page, url) {
		try {
			// Ensure URL has a protocol
			if (!url.startsWith("http://") && !url.startsWith("https://")) {
				url = "https://" + url;
			}
			this.emitStatus(socket, `🌐 Navigating to: ${url}`);
			await page.goto(url, { waitUntil: "domcontentloaded" });
			await page.waitForLoadState("networkidle"); // Wait for network to be idle
			this.emitStatus(
				socket,
				`✅ Successfully navigated to: ${page.url()}`,
				"success",
			);
			await this.analyzePageStructure(socket, page); // Pass socket and page
		} catch (error) {
			this.emitStatus(
				socket,
				`❌ Navigation failed for "${url}": ${error.message}`,
				"error",
			);
			throw error; // Re-throw to be caught by executeAIActions
		}
	}

	/**
	 * Handles click commands.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} selector - The CSS selector or descriptive text for the element.
	 */
	async handleClick(socket, page, selector) {
		try {
			this.emitStatus(socket, `🔍 Looking for element: "${selector}"`);
			const element = await this.findElement(page, selector); // Pass page
			if (element) {
				this.emitStatus(socket, `✅ Element found, clicking...`);
				await element.click({ timeout: 5000 }); // Add timeout for click
				this.emitStatus(socket, `✅ Successfully clicked element`, "success");
				await page.waitForLoadState("domcontentloaded").catch(() => {}); // Wait for potential navigation, don't fail if no navigation
				await page.waitForTimeout(1000); // Small pause for visual feedback
			} else {
				this.emitStatus(
					socket,
					`❌ Element not found for click: "${selector}"`,
					"error",
				);
				await this.suggestAlternatives(socket, page, selector); // Pass socket and page
				throw new Error(`Element "${selector}" not found for click.`);
			}
		} catch (error) {
			this.emitStatus(socket, `❌ Click failed: ${error.message}`, "error");
			throw error;
		}
	}

	/**
	 * Handles type commands.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} selector - The CSS selector or descriptive text for the input field.
	 * @param {string} text - The text to type.
	 */
	async handleType(socket, page, selector, text) {
		try {
			this.emitStatus(socket, `🔍 Looking for input field: "${selector}"`);
			const element = await this.findElement(page, selector); // Pass page
			if (element) {
				this.emitStatus(socket, `✅ Input field found, typing: "${text}"`);
				await element.fill(text, { timeout: 5000 }); // Add timeout for fill
				this.emitStatus(socket, `✅ Successfully typed text`, "success");
			} else {
				this.emitStatus(
					socket,
					`❌ Input field not found: "${selector}"`,
					"error",
				);
				throw new Error(`Input field "${selector}" not found for typing.`);
			}
		} catch (error) {
			this.emitStatus(socket, `❌ Type failed: ${error.message}`, "error");
			throw error;
		}
	}

	/**
	 * Handles AI analysis requests for a page.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} target - The specific element or area to analyze.
	 */
	async handleAnalyze(socket, page, target) {
		try {
			this.emitStatus(socket, `🔍 Analyzing page for: "${target}"`);
			const pageInfo = await this.getPageInfo(page); // Pass page
			const analysis = await this.analyzePageWithAI(socket, pageInfo, target); // Pass socket
			this.emitStatus(
				socket,
				`📊 Analysis complete: ${analysis.summary}`,
				"success",
			);
			if (analysis.suggestions && analysis.suggestions.length > 0) {
				analysis.suggestions.forEach((suggestion) => {
					this.emitStatus(socket, `💡 Suggestion: ${suggestion}`);
				});
			}
		} catch (error) {
			this.emitStatus(socket, `❌ Analysis failed: ${error.message}`, "error");
			throw error;
		}
	}

	/**
	 * Handles wait commands.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance (not directly used but for consistency).
	 * @param {string} duration - The duration to wait in milliseconds.
	 */
	async handleWait(socket, page, duration) {
		const waitTime = parseInt(duration, 10) || 2000;
		if (isNaN(waitTime) || waitTime <= 0) {
			this.emitStatus(
				socket,
				`❌ Invalid wait duration: "${duration}". Defaulting to 2000ms.`,
				"warning",
			);
			return await this.handleWait(socket, page, "2000"); // Recursive call with default
		}
		this.emitStatus(socket, `⏳ Waiting ${waitTime}ms...`);
		await page.waitForTimeout(waitTime);
		this.emitStatus(socket, `✅ Wait complete`, "success");
	}

	/**
	 * Handles scroll commands.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} direction - The scroll direction ("down", "up", "top").
	 */
	async handleScroll(socket, page, direction) {
		try {
			this.emitStatus(socket, `📜 Scrolling ${direction}...`);
			let scrollAmount = 500; // Default scroll amount
			switch (direction.toLowerCase()) {
				case "down":
					await page.evaluate(
						(amount) => window.scrollBy(0, amount),
						scrollAmount,
					);
					break;
				case "up":
					await page.evaluate(
						(amount) => window.scrollBy(0, -amount),
						scrollAmount,
					);
					break;
				case "top":
				case "home":
					await page.evaluate(() => window.scrollTo(0, 0));
					break;
				case "bottom":
					await page.evaluate(() =>
						window.scrollTo(0, document.body.scrollHeight),
					);
					break;
				default:
					this.emitStatus(
						socket,
						`❓ Unknown scroll direction: "${direction}". Use "up", "down", "top", or "bottom".`,
						"warning",
					);
					return;
			}
			this.emitStatus(socket, `✅ Scrolled ${direction}`, "success");
		} catch (error) {
			this.emitStatus(socket, `❌ Scroll failed: ${error.message}`, "error");
			throw error;
		}
	}

	/**
	 * Handles data extraction requests.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} selector - The CSS selector for elements to extract.
	 */
	async handleExtract(socket, page, selector) {
		try {
			this.emitStatus(
				socket,
				`📤 Extracting data using selector: "${selector}"`,
			);
			const elements = await page.locator(selector).all();
			const extractedData = [];
			for (const element of elements) {
				const text = (await element.textContent())?.trim() || "";
				const href = (await element.getAttribute("href"))?.trim() || "";
				extractedData.push({ text, href });
			}
			this.emitStatus(
				socket,
				`✅ Extracted ${extractedData.length} items`,
				"success",
			);
			this.emitData(socket, "extracted_data", extractedData); // Pass socket
		} catch (error) {
			this.emitStatus(socket, `❌ Extract failed: ${error.message}`, "error");
			throw error;
		}
	}

	/**
	 * Attempts to find an element using multiple Playwright selector strategies.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} selector - The primary selector or descriptive text.
	 * @returns {Promise<Locator|null>} A Playwright Locator if found, otherwise null.
	 */
	async findElement(page, selector) {
		for (const strategy of PLAYWRIGHT_SELECTOR_STRATEGIES) {
			try {
				const element = strategy(page, selector);
				if (element && (await element.count()) > 0) {
					// Check if the element is visible before returning
					if (await element.isVisible({ timeout: 1000 })) {
						return element;
					}
				}
			} catch (error) {
				// Log the error but continue trying other strategies
				console.warn(
					`[Playwright Find Element] Strategy failed for "${selector}": ${error.message}`,
				);
			}
		}
		return null; // No element found after all strategies
	}

	/**
	 * Analyzes the current page's structure and emits it to the client.
	 * @param {Socket} socket - The socket for status and data updates.
	 * @param {Page} page - The Playwright page instance.
	 */
	async analyzePageStructure(socket, page) {
		try {
			this.emitStatus(socket, `🔍 Analyzing page structure...`);
			const structure = await page.evaluate(() => {
				const getElementInfo = (el) => {
					// Basic sanity check to ensure element is visible or has size
					const rect = el.getBoundingClientRect();
					if (rect.width === 0 && rect.height === 0) return null; // Skip hidden/zero-sized elements

					return {
						tag: el.tagName.toLowerCase(),
						text: el.textContent?.slice(0, 100).trim() || "", // Trim text content
						classes: Array.from(el.classList),
						id: el.id || null,
						name: el.name || null, // Include name attribute for inputs/forms
						type: el.type || null, // Include type for inputs
						placeholder: el.placeholder || null, // Include placeholder for inputs
						href: el.href || null, // Include href for links
						// Only capture relevant attributes for brevity and security
						attributes: Array.from(el.attributes).reduce((acc, attr) => {
							if (
								["aria-label", "title", "data-testid", "role"].includes(
									attr.name,
								)
							) {
								acc[attr.name] = attr.value;
							}
							return acc;
						}, {}),
					};
				};

				// Filter out nulls from getElementInfo
				const filterAndMap = (selector) =>
					Array.from(document.querySelectorAll(selector))
						.map(getElementInfo)
						.filter(Boolean);

				return {
					title: document.title,
					url: window.location.href,
					buttons: filterAndMap("button, input[type='submit']"), // More comprehensive button selection
					links: filterAndMap("a"),
					inputs: filterAndMap("input:not([type='hidden']), textarea, select"), // Exclude hidden inputs
					forms: filterAndMap("form"),
					// Add some prominent headings or text snippets
					headings: Array.from(document.querySelectorAll("h1, h2, h3, h4"))
						.slice(0, 5)
						.map((h) => h.textContent?.slice(0, 100).trim() || ""),
				};
			});
			this.emitStatus(
				socket,
				`📊 Found ${structure.buttons.length} buttons, ${structure.links.length} links, ${structure.inputs.length} inputs`,
				"success",
			);
			this.emitData(socket, "page_structure", structure); // Pass socket
		} catch (error) {
			this.emitStatus(
				socket,
				`❌ Structure analysis failed: ${error.message}`,
				"error",
			);
			console.error(
				`[Playwright Error - ${socket.id}] Page structure analysis failed:`,
				error,
			);
		}
	}

	/**
	 * Suggests alternative selectors or elements when a target is not found.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Page} page - The Playwright page instance.
	 * @param {string} failedSelector - The selector that failed to find an element.
	 */
	async suggestAlternatives(socket, page, failedSelector) {
		try {
			const suggestions = await page.evaluate((sel) => {
				const elements = document.querySelectorAll("body *"); // Search all elements
				const matches = [];
				const lowerSel = sel.toLowerCase();

				for (const el of elements) {
					// Check text content, attributes (aria-label, title, placeholder, name, id)
					const textContent = el.textContent?.toLowerCase() || "";
					const ariaLabel = el.getAttribute("aria-label")?.toLowerCase() || "";
					const title = el.getAttribute("title")?.toLowerCase() || "";
					const placeholder =
						el.getAttribute("placeholder")?.toLowerCase() || "";
					const name = el.getAttribute("name")?.toLowerCase() || "";
					const id = el.id?.toLowerCase() || "";
					const classes = Array.from(el.classList)
						.map((cls) => cls.toLowerCase())
						.join(" ");

					if (
						textContent.includes(lowerSel) ||
						ariaLabel.includes(lowerSel) ||
						title.includes(lowerSel) ||
						placeholder.includes(lowerSel) ||
						name.includes(lowerSel) ||
						id.includes(lowerSel) ||
						classes.includes(lowerSel)
					) {
						// Construct a more robust selector if possible
						let bestSelector = "";
						if (el.id) {
							bestSelector = `#${el.id}`;
						} else if (el.name) {
							bestSelector = `[name="${el.name}"]`;
						} else if (Array.from(el.classList).length > 0) {
							bestSelector = `${el.tagName.toLowerCase()}.${Array.from(
								el.classList,
							).join(".")}`;
						} else {
							bestSelector = el.tagName.toLowerCase();
						}

						matches.push({
							text:
								el.textContent?.slice(0, 50).trim() ||
								el.outerHTML.slice(0, 50).trim(), // Show element HTML if text is empty
							tag: el.tagName.toLowerCase(),
							selector: bestSelector,
							foundBy: textContent.includes(lowerSel)
								? "text"
								: ariaLabel.includes(lowerSel)
								  ? "aria-label"
								  : title.includes(lowerSel)
								    ? "title"
								    : placeholder.includes(lowerSel)
								      ? "placeholder"
								      : name.includes(lowerSel)
								        ? "name"
								        : id.includes(lowerSel)
								          ? "id"
								          : classes.includes(lowerSel)
								            ? "class"
								            : "unknown",
						});
					}
				}
				return matches.slice(0, 5); // Limit suggestions
			}, failedSelector);

			if (suggestions.length > 0) {
				this.emitStatus(
					socket,
					`💡 Found ${suggestions.length} similar elements for "${failedSelector}":`,
				);
				suggestions.forEach((suggestion, index) => {
					this.emitStatus(
						socket,
						`   ${index + 1}. <${suggestion.tag}> (matched by ${
							suggestion.foundBy
						}): "${suggestion.text}" | Selector: "${suggestion.selector}"`,
					);
				});
			} else {
				this.emitStatus(
					socket,
					`🧐 No specific alternatives found for "${failedSelector}". Please try a more general command or verify the element exists.`,
					"info",
				);
			}
		} catch (error) {
			console.error(
				`[Playwright Error - ${socket.id}] Error suggesting alternatives:`,
				error,
			);
			this.emitStatus(
				socket,
				`❌ Failed to suggest alternatives: ${error.message}`,
				"error",
			);
		}
	}

	/**
	 * Gets relevant page information for AI analysis.
	 * @param {Page} page - The Playwright page instance.
	 * @returns {Promise<Object>} An object containing page details.
	 */
	async getPageInfo(page) {
		return await page.evaluate(() => {
			// Be mindful of the data size passed back to Node.js
			const extractText = (selector, limit = 50) =>
				Array.from(document.querySelectorAll(selector))
					.slice(0, 10) // Limit number of elements
					.map((el) => el.textContent?.slice(0, limit).trim() || "");

			return {
				title: document.title,
				url: window.location.href,
				headings: extractText("h1,h2,h3,h4"),
				buttons: extractText("button, input[type='submit']"),
				links: extractText("a"),
				inputs: extractText("input:not([type='hidden']), textarea, select"),
				// Only capture a snippet of body text to avoid huge payloads
				bodySnippet: document.body.textContent?.slice(0, 500).trim() || "",
			};
		});
	}

	/**
	 * Sends page info to OpenAI for deeper analysis regarding a target element.
	 * @param {Socket} socket - The socket for status updates.
	 * @param {Object} pageInfo - Structured information about the current page.
	 * @param {string} target - The element or action the user is looking for.
	 * @returns {Promise<Object>} An object with a summary and suggestions from AI.
	 */
	async analyzePageWithAI(socket, pageInfo, target) {
		// Simple token estimation for prompt truncation
		const estimateTokens = (text) => Math.ceil(text.length / 4);
		const MAX_PROMPT_TOKENS = 7000; // GPT-4 Turbo's context window is large, but still good to limit

		let pageInfoStr = JSON.stringify(pageInfo);

		// Truncate pageInfo if it's too large to stay within token limits
		if (estimateTokens(pageInfoStr) > MAX_PROMPT_TOKENS * 0.8) {
			console.warn(
				`[AI Analysis] Page info too large (${estimateTokens(
					pageInfoStr,
				)} tokens), truncating...`,
			);
			pageInfo.bodySnippet = pageInfo.bodySnippet.slice(0, 200);
			pageInfo.headings = pageInfo.headings.slice(0, 3);
			pageInfo.buttons = pageInfo.buttons.slice(0, 5);
			pageInfo.links = pageInfo.links.slice(0, 5);
			pageInfo.inputs = pageInfo.inputs.slice(0, 5);
			pageInfoStr = JSON.stringify(pageInfo); // Re-stringify
		}

		const systemPrompt = `You are an expert web page analyzer. Given the page structure and a user's target, provide concise insights and up to 3 actionable suggestions for finding or interacting with the element. Focus on what might be the best selector or approach.
        
        Example Output:
        Summary: "The page has several input fields for login, the user might be looking for the one with placeholder 'Username'."
        Suggestions: ["Try selector 'input[name=\"username\"]'", "Look for a label 'Username' associated with an input", "Consider if the field is visible/enabled"]`;

		const userPrompt = `Page Info: ${pageInfoStr}\n\nUser is looking for: "${target}"\n\nProvide analysis and suggestions in JSON format like: {\"summary\": \"...\", \"suggestions\": [\"...\", \"...\"]}`;

		try {
			const completion = await this.openai.chat.completions.create({
				model: "gpt-4-turbo-preview", // Use a suitable model
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				response_format: { type: "json_object" }, // Ensure JSON output
			});

			const responseContent = completion.choices[0].message.content;
			return JSON.parse(responseContent); // Directly parse due to response_format
		} catch (error) {
			this.emitStatus(
				socket,
				`❌ Deep analysis with AI failed: ${error.message}`,
				"error",
			);
			console.error(
				`[OpenAI Error] Page analysis failed for ${socket.id}:`,
				error,
			);
			return {
				summary: "Page analysis failed due to an AI error.",
				suggestions: [],
			};
		}
	}

	/**
	 * Generates a Playwright test script based on the session's action history.
	 * @param {Socket} socket - The socket whose session history to use.
	 */
	async generatePlaywrightTest(socket) {
		const session = this.activeSessions.get(socket.id);
		if (!session || session.actionHistory.length === 0) {
			this.emitStatus(
				socket,
				"No actions recorded for this session to generate a test.",
				"info",
			);
			return;
		}

		let testCode = `const { test, expect } = require('@playwright/test');\n\n`;
		testCode += `test('AI Web Automation Scenario for Session ${socket.id}', async ({ page }) => {\n`;
		testCode += `    // Test generated on ${new Date().toISOString()}\n\n`;

		for (const action of session.actionHistory) {
			const { message, aiResponse } = action;
			testCode += `    // User command: "${message}"\n`;
			testCode += `    // AI Action: ${
				aiResponse.description || aiResponse.action
			}\n`;

			// Enhanced Playwright code generation for robustness
			switch (aiResponse.action) {
				case "navigate":
					const navUrl = aiResponse.target.startsWith("http")
						? aiResponse.target
						: "https://" + aiResponse.target;
					testCode += `    await page.goto('${navUrl}', { waitUntil: 'domcontentloaded' });\n`;
					testCode += `    // It's good practice to add an assertion after navigation\n`;
					testCode += `    await expect(page).toHaveURL(/${new URL(
						navUrl,
					).hostname.replace(/\./g, "\\.")}/);\n`; // Assert URL contains hostname
					testCode += `    await page.waitForLoadState('networkidle');\n`; // Ensure page is fully loaded
					break;
				case "click":
					testCode += `    // Attempt to click element '${aiResponse.target}'\n`;
					testCode += `    await page.locator('${aiResponse.target}').first().click({ timeout: 10000 });\n`;
					testCode += `    // Add a small pause or wait for navigation after click\n`;
					testCode += `    await page.waitForTimeout(1000);\n`;
					break;
				case "type":
					testCode += `    // Type '${aiResponse.value}' into '${aiResponse.target}'\n`;
					testCode += `    await page.locator('${aiResponse.target}').first().fill('${aiResponse.value}', { timeout: 10000 });\n`;
					testCode += `    // Add an assertion for typed value\n`;
					testCode += `    await expect(page.locator('${aiResponse.target}').first()).toHaveValue('${aiResponse.value}');\n`;
					break;
				case "wait":
					const waitDuration = parseInt(aiResponse.target, 10) || 2000;
					testCode += `    // Waiting for ${waitDuration}ms as requested\n`;
					testCode += `    await page.waitForTimeout(${waitDuration});\n`;
					break;
				case "scroll":
					if (aiResponse.target === "down") {
						testCode += `    // Scrolling down the page\n`;
						testCode += `    await page.evaluate(() => window.scrollBy(0, 500));\n`;
					} else if (aiResponse.target === "up") {
						testCode += `    // Scrolling up the page\n`;
						testCode += `    await page.evaluate(() => window.scrollBy(0, -500));\n`;
					} else if (aiResponse.target === "top") {
						testCode += `    // Scrolling to the top of the page\n`;
						testCode += `    await page.evaluate(() => window.scrollTo(0, 0));\n`;
					} else if (aiResponse.target === "bottom") {
						testCode += `    // Scrolling to the bottom of the page\n`;
						testCode += `    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));\n`;
					}
					break;
				case "extract":
					testCode += `    // Extracting data using selector: '${aiResponse.target}'\n`;
					testCode += `    const extractedElements = await page.locator('${aiResponse.target}').all();\n`;
					testCode += `    const extractedData = [];\n`;
					testCode += `    for (const element of extractedElements) {\n`;
					testCode += `        const text = await element.textContent();\n`;
					testCode += `        const href = await element.getAttribute('href');\n`;
					testCode += `        extractedData.push({ text: text ? text.trim() : null, href });\n`;
					testCode += `    }\n`;
					testCode += `    console.log('Extracted Data:', extractedData);\n`;
					testCode += `    // You might add an assertion here, e.g., expect(extractedData.length).toBeGreaterThan(0);\n`;
					break;
				case "analyze":
					testCode += `    // AI performed an analysis: ${aiResponse.description}\n`;
					testCode += `    // This step typically doesn't translate directly to Playwright actions, it's for AI's internal logic.\n`;
					break;
				case "error":
					testCode += `    // !!! An error occurred during this step in the live session: ${aiResponse.description}\n`;
					break;
				default:
					testCode += `    // Unhandled action in test generation: ${aiResponse.action}\n`;
			}
			testCode += `\n`; // Add a newline after each action for readability
		}
		testCode += `});\n`;

		socket.emit("test_case", { testCode });
		this.emitStatus(socket, "✅ Playwright test case generated", "success");
	}

	/**
	 * Emits a status update message to a specific client socket.
	 * @param {Socket} socket - The target socket.
	 * @param {string} message - The status message.
	 * @param {string} [type='info'] - The type of status (info, success, error, warning).
	 */
	emitStatus(socket, message, type = "info") {
		console.log(`[Status - ${socket.id}] ${message}`); // Server-side console log
		if (socket) {
			socket.emit("status_update", {
				message,
				type, // Include type for frontend styling
				timestamp: new Date().toISOString(),
			});
		}
	}

	/**
	 * Emits data updates to a specific client socket.
	 * @param {Socket} socket - The target socket.
	 * @param {string} type - The type of data (e.g., 'page_structure', 'extracted_data').
	 * @param {Object} data - The data payload.
	 */
	emitData(socket, type, data) {
		if (socket) {
			socket.emit("data_update", {
				type,
				data,
				timestamp: new Date().toISOString(),
			});
		}
	}

	/**
	 * Cleans up browser resources for a specific session.
	 * @param {string} socketId - The ID of the socket/session to clean up.
	 */
	async cleanupSession(socketId) {
		const session = this.activeSessions.get(socketId);
		if (session) {
			console.log(`[Playwright] Cleaning up session for ${socketId}`);
			if (session.page) {
				try {
					await session.page.close();
					console.log(`[Playwright] Page closed for ${socketId}`);
				} catch (error) {
					console.error(
						`[Playwright Error] Failed to close page for ${socketId}:`,
						error.message,
					);
				}
			}
			if (session.browser) {
				try {
					await session.browser.close();
					console.log(`[Playwright] Browser closed for ${socketId}`);
				} catch (error) {
					console.error(
						`[Playwright Error] Failed to close browser for ${socketId}:`,
						error.message,
					);
				}
			}
			this.activeSessions.delete(socketId);
			console.log(`[Session Manager] Session ${socketId} removed.`);
		}
	}

	/**
	 * Handles client disconnection.
	 * @param {Socket} socket - The disconnected socket.
	 */
	handleSocketDisconnect(socket) {
		console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
		this.cleanupSession(socket.id); // Clean up resources for this specific disconnected client
	}

	/**
	 * Starts the HTTP server.
	 * @param {number} port - The port to listen on.
	 */
	start(port = 3000) {
		this.server.listen(port, () => {
			console.log(`🚀 AI Web Automation Server running on port ${port}`);
			console.log(
				`📱 Access frontend at http://localhost:${port} (or your host IP)`,
			);
			console.log(`⚙️ Health check at http://localhost:${port}/health`);
		});
	}
}

// --- Server Initialization & Graceful Shutdown ---
const server = new AIWebAutomationServer();
const PORT = process.env.PORT || 3000;
server.start(PORT);

process.on("SIGINT", async () => {
	console.log("\n🛑 Shutting down server gracefully...");
	// Iterate over all active sessions and clean them up
	for (const socketId of server.activeSessions.keys()) {
		await server.cleanupSession(socketId);
	}
	server.server.close(() => {
		console.log("✅ HTTP server closed.");
		process.exit(0);
	});
});

process.on("SIGTERM", async () => {
	console.log("\n🛑 SIGTERM received. Shutting down gracefully...");
	for (const socketId of server.activeSessions.keys()) {
		await server.cleanupSession(socketId);
	}
	server.server.close(() => {
		console.log("✅ HTTP server closed from SIGTERM.");
		process.exit(0);
	});
});

// Ensure module.exports is at the end if this file is primarily for execution
// and only exports the class for testing or require in other files.
module.exports = AIWebAutomationServer;
