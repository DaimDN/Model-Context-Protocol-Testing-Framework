import express from 'express';
import cors from 'cors';
import { chromium, firefox, webkit, Browser, Page, BrowserContext } from 'playwright';

const app = express();
app.use(cors());
app.use(express.json());

class CopilotPlaywrightAgent {
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
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        message: 'Playwright agent ready for Copilot commands'
      });
    });

    // Natural language command endpoint for Copilot
    app.post('/copilot/command', async (req, res) => {
      try {
        const { command, pageId, context } = req.body;
        const result = await this.executeNaturalLanguageCommand(command, pageId, context);
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Try breaking down the command into smaller steps'
        });
      }
    });

    // Session management for Copilot workflows
    app.post('/copilot/session/start', async (req, res) => {
      try {
        const { sessionId, browserType = 'chromium', headless = false } = req.body;
        const result = await this.startCopilotSession(sessionId, browserType, headless);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Get page state for Copilot context
    app.get('/copilot/page/:pageId/state', async (req, res) => {
      try {
        const { pageId } = req.params;
        const result = await this.getPageStateForCopilot(pageId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Multi-step workflow execution
    app.post('/copilot/workflow', async (req, res) => {
      try {
        const { workflow, pageId } = req.body;
        const result = await this.executeWorkflow(workflow, pageId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Smart element interaction
    app.post('/copilot/interact', async (req, res) => {
      try {
        const { pageId, instruction, data } = req.body;
        const result = await this.smartInteract(pageId, instruction, data);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Original Playwright API routes for direct control
    this.setupOriginalRoutes();
  }

  private setupOriginalRoutes() {
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

  // Copilot-specific methods
  private async executeNaturalLanguageCommand(command: string, pageId: string, context?: any) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // Parse natural language commands
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('click') || lowerCommand.includes('press')) {
      return await this.handleClickCommand(page, command, context);
    } else if (lowerCommand.includes('type') || lowerCommand.includes('fill') || lowerCommand.includes('enter')) {
      return await this.handleTypeCommand(page, command, context);
    } else if (lowerCommand.includes('navigate') || lowerCommand.includes('go to')) {
      return await this.handleNavigateCommand(page, command, context);
    } else if (lowerCommand.includes('wait') || lowerCommand.includes('until')) {
      return await this.handleWaitCommand(page, command, context);
    } else if (lowerCommand.includes('screenshot') || lowerCommand.includes('capture')) {
      return await this.handleScreenshotCommand(page, command, context);
    } else if (lowerCommand.includes('scroll')) {
      return await this.handleScrollCommand(page, command, context);
    } else {
      return { 
        success: false, 
        message: `Command "${command}" not recognized. Available commands: click, type, navigate, wait, screenshot, scroll`,
        suggestions: ['Try being more specific', 'Use action words like "click", "type", "navigate"']
      };
    }
  }

  private async handleClickCommand(page: Page, command: string, context?: any) {
    // Extract what to click from the command
    const clickTargets = this.extractClickTarget(command);
    
    for (const target of clickTargets) {
      try {
        await page.click(target);
        return { success: true, action: 'click', target, command };
      } catch (error) {
        // Try alternative selectors
        continue;
      }
    }
    
    return { success: false, message: `Could not find clickable element for: ${command}` };
  }

  private async handleTypeCommand(page: Page, command: string, context?: any) {
    const typeData = this.extractTypeData(command);
    
    if (typeData.selector && typeData.text) {
      await page.fill(typeData.selector, typeData.text);
      return { success: true, action: 'type', selector: typeData.selector, text: typeData.text };
    }
    
    return { success: false, message: `Could not extract type information from: ${command}` };
  }

  private async handleNavigateCommand(page: Page, command: string, context?: any) {
    const url = this.extractUrl(command);
    
    if (url) {
      await page.goto(url);
      return { success: true, action: 'navigate', url };
    }
    
    return { success: false, message: `Could not extract URL from: ${command}` };
  }

  private async handleWaitCommand(page: Page, command: string, context?: any) {
    const waitCondition = this.extractWaitCondition(command);
    
    if (waitCondition.type === 'selector') {
      await page.waitForSelector(waitCondition.value);
      return { success: true, action: 'wait', condition: waitCondition };
    } else if (waitCondition.type === 'timeout') {
      await page.waitForTimeout(waitCondition.value);
      return { success: true, action: 'wait', condition: waitCondition };
    }
    
    return { success: false, message: `Could not extract wait condition from: ${command}` };
  }

  private async handleScreenshotCommand(page: Page, command: string, context?: any) {
    const fullPage = command.includes('full') || command.includes('entire');
    const screenshot = await page.screenshot({ fullPage });
    const base64 = screenshot.toString('base64');
    
    return { success: true, action: 'screenshot', screenshot: base64, fullPage };
  }

  private async handleScrollCommand(page: Page, command: string, context?: any) {
    const scrollData = this.extractScrollData(command);
    
    await page.evaluate((data) => {
      window.scrollBy(data.x, data.y);
    }, scrollData);
    
    return { success: true, action: 'scroll', ...scrollData };
  }

  private async startCopilotSession(sessionId: string, browserType: string, headless: boolean) {
    const browserId = `copilot-${sessionId}`;
    const contextId = `copilot-context-${sessionId}`;
    const pageId = `copilot-page-${sessionId}`;

    // Launch browser
    await this.launchBrowser(browserType, headless, browserId);
    
    // Create context
    await this.createContext(browserId, contextId, { width: 1920, height: 1080 });
    
    // Create page
    await this.createPage(contextId, pageId);

    return { 
      success: true, 
      sessionId, 
      browserId, 
      contextId, 
      pageId,
      message: 'Copilot session ready. You can now send natural language commands.'
    };
  }

  private async getPageStateForCopilot(pageId: string) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const url = page.url();
    const title = await page.title();
    const elements = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim());
      const inputs = Array.from(document.querySelectorAll('input')).map(i => i.placeholder || i.name);
      const links = Array.from(document.querySelectorAll('a')).map(a => a.textContent?.trim());
      
      return { buttons, inputs, links };
    });

    return {
      success: true,
      pageState: {
        url,
        title,
        elements,
        timestamp: new Date().toISOString()
      }
    };
  }

  private async executeWorkflow(workflow: any[], pageId: string) {
    const results = [];
    
    for (const step of workflow) {
      try {
        const result = await this.executeNaturalLanguageCommand(step.command, pageId, step.context);
        results.push({ step: step.name, result });
      } catch (error) {
        results.push({ step: step.name, error: error.message });
      }
    }
    
    return { success: true, workflow: results };
  }

  private async smartInteract(pageId: string, instruction: string, data?: any) {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // Use AI-like heuristics to find and interact with elements
    const result = await page.evaluate((instruction, data) => {
      // Smart element detection based on instruction
      const findBestElement = (instruction: string) => {
        const lower = instruction.toLowerCase();
        
        if (lower.includes('submit') || lower.includes('send')) {
          return document.querySelector('button[type="submit"], input[type="submit"]');
        } else if (lower.includes('search')) {
          return document.querySelector('input[type="search"], input[placeholder*="search"]');
        } else if (lower.includes('email')) {
          return document.querySelector('input[type="email"], input[name*="email"]');
        } else if (lower.includes('password')) {
          return document.querySelector('input[type="password"]');
        }
        
        return null;
      };
      
      const element = findBestElement(instruction);
      if (element) {
        return { found: true, tagName: element.tagName, type: element.type || 'unknown' };
      }
      
      return { found: false };
    }, instruction, data);

    return { success: true, interaction: result, instruction };
  }

  // Helper methods for parsing natural language
  private extractClickTarget(command: string): string[] {
    const targets = [];
    
    // Common patterns
    if (command.includes('button')) {
      targets.push('button');
    }
    if (command.includes('submit')) {
      targets.push('button[type="submit"]', 'input[type="submit"]');
    }
    if (command.includes('link')) {
      targets.push('a');
    }
    
    // Extract quoted text
    const quoted = command.match(/"([^"]*)"/);
    if (quoted) {
      targets.push(`text="${quoted[1]}"`, `[aria-label="${quoted[1]}"]`);
    }
    
    return targets;
  }

  private extractTypeData(command: string): { selector?: string, text?: string } {
    const typeMatch = command.match(/type\s+"([^"]*)"(?:\s+(?:in|into)\s+(.+))?/i);
    if (typeMatch) {
      return { text: typeMatch[1], selector: typeMatch[2] || 'input' };
    }
    
    const fillMatch = command.match(/fill\s+(.+)\s+with\s+"([^"]*)"/i);
    if (fillMatch) {
      return { selector: fillMatch[1], text: fillMatch[2] };
    }
    
    return {};
  }

  private extractUrl(command: string): string | null {
    const urlMatch = command.match(/(?:navigate|go)\s+to\s+(.+)/i);
    if (urlMatch) {
      let url = urlMatch[1].trim();
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      return url;
    }
    return null;
  }

  private extractWaitCondition(command: string): { type: string, value: any } {
    const selectorMatch = command.match(/wait\s+(?:for|until)\s+(.+)/i);
    if (selectorMatch) {
      return { type: 'selector', value: selectorMatch[1] };
    }
    
    const timeMatch = command.match(/wait\s+(\d+)\s*(?:ms|seconds?)/i);
    if (timeMatch) {
      const time = parseInt(timeMatch[1]);
      const unit = command.includes('second') ? 1000 : 1;
      return { type: 'timeout', value: time * unit };
    }
    
    return { type: 'timeout', value: 1000 };
  }

  private extractScrollData(command: string): { x: number, y: number } {
    if (command.includes('down')) {
      return { x: 0, y: 500 };
    } else if (command.includes('up')) {
      return { x: 0, y: -500 };
    } else if (command.includes('right')) {
      return { x: 500, y: 0 };
    } else if (command.includes('left')) {
      return { x: -500, y: 0 };
    }
    
    return { x: 0, y: 500 };
  }

  // Original Playwright methods
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
      console.log(`🤖 Copilot Playwright Agent running on port ${this.port}`);
      console.log(`🚀 Ready to receive natural language commands!`);
      console.log(`📝 Example: POST /copilot/command with { "command": "click the submit button", "pageId": "your-page-id" }`);
    });
  }
}

// Start the server
const server = new CopilotPlaywrightAgent(3000);
server.start();
