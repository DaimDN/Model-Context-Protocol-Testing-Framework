import express from 'express';
import cors from 'cors';
import { chromium, firefox, webkit, Browser, Page, BrowserContext } from 'playwright';

const app = express();
app.use(cors());
app.use(express.json());

class PlaywrightHTTPServer {
  private browsers: Map<string, Browser> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Launch browser
    app.post('/browser/launch', async (req, res) => {
      try {
        const { browser: browserType, headless = true, browserId } = req.body;
        const result = await this.launchBrowser(browserType, headless, browserId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Create context
    app.post('/context/create', async (req, res) => {
      try {
        const { browserId, contextId, viewport, userAgent } = req.body;
        const result = await this.createContext(browserId, contextId, viewport, userAgent);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Create page
    app.post('/page/create', async (req, res) => {
      try {
        const { contextId, pageId } = req.body;
        const result = await this.createPage(contextId, pageId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Navigate
    app.post('/page/navigate', async (req, res) => {
      try {
        const { pageId, url } = req.body;
        const result = await this.navigate(pageId, url);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Click
    app.post('/page/click', async (req, res) => {
      try {
        const { pageId, selector } = req.body;
        const result = await this.click(pageId, selector);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Fill
    app.post('/page/fill', async (req, res) => {
      try {
        const { pageId, selector, value } = req.body;
        const result = await this.fill(pageId, selector, value);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Get text
    app.get('/page/:pageId/text', async (req, res) => {
      try {
        const { pageId } = req.params;
        const { selector } = req.query;
        const result = await this.getText(pageId, selector as string);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Screenshot
    app.post('/page/screenshot', async (req, res) => {
      try {
        const { pageId, fullPage = false } = req.body;
        const result = await this.screenshot(pageId, fullPage);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Execute JavaScript
    app.post('/page/evaluate', async (req, res) => {
      try {
        const { pageId, script } = req.body;
        const result = await this.evaluate(pageId, script);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Close resources
    app.delete('/page/:pageId', async (req, res) => {
      try {
        const { pageId } = req.params;
        const result = await this.closePage(pageId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    app.delete('/context/:contextId', async (req, res) => {
      try {
        const { contextId } = req.params;
        const result = await this.closeContext(contextId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    app.delete('/browser/:browserId', async (req, res) => {
      try {
        const { browserId } = req.params;
        const result = await this.closeBrowser(browserId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
  }

  private async launchBrowser(browserType: string, headless: boolean, browserId: string) {
    if (this.browsers.has(browserId)) {
      throw new Error(`Browser with ID ${browserId} already exists`);
    }

    let browser: Browser;
    switch (browserType) {
      case 'chromium':
        browser = await chromium.launch({ headless });
        break;
      case 'firefox':
        browser = await firefox.launch({ headless });
        break;
      case 'webkit':
        browser = await webkit.launch({ headless });
        break;
      default:
        throw new Error(`Unsupported browser type: ${browserType}`);
    }

    this.browsers.set(browserId, browser);
    return { success: true, browserId, browserType };
  }

  private async createContext(browserId: string, contextId: string, viewport?: any, userAgent?: string) {
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

  private async createPage(contextId: string, pageId: string) {
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

  private async navigate(pageId: string, url: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await page.goto(url);
    return { success: true, url };
  }

  private async click(pageId: string, selector: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await page.click(selector);
    return { success: true, selector };
  }

  private async fill(pageId: string, selector: string, value: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await page.fill(selector, value);
    return { success: true, selector, value };
  }

  private async getText(pageId: string, selector: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const text = await page.textContent(selector);
    return { success: true, text };
  }

  private async screenshot(pageId: string, fullPage: boolean) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const screenshot = await page.screenshot({ fullPage });
    const base64 = screenshot.toString('base64');
    return { success: true, screenshot: base64, size: screenshot.length };
  }

  private async evaluate(pageId: string, script: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const result = await page.evaluate(script);
    return { success: true, result };
  }

  private async closePage(pageId: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await page.close();
    this.pages.delete(pageId);
    return { success: true, pageId };
  }

  private async closeContext(contextId: string) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context with ID ${contextId} not found`);
    }

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

  private async closeBrowser(browserId: string) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser with ID ${browserId} not found`);
    }

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

  public start() {
    app.listen(this.port, () => {
      console.log(`Playwright HTTP Server running on port ${this.port}`);
    });
  }
}

// Start the server
const server = new PlaywrightHTTPServer(3000);
server.start();
