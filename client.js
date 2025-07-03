// playwrightCopilotClient.ts
// This client allows Copilot Chat to interact with your Playwright server

class PlaywrightCopilotClient {
  private baseUrl: string;
  private currentSession: string | null = null;
  private currentPageId: string | null = null;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  // Function that Copilot Chat can call to launch browser
  async launchBrowser(browserType: string = 'chromium', headless: boolean = false): Promise<string> {
    try {
      const sessionId = `session-${Date.now()}`;
      
      const response = await fetch(`${this.baseUrl}/copilot/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, browserType, headless })
      });

      const result = await response.json();
      
      if (result.success) {
        this.currentSession = sessionId;
        this.currentPageId = result.pageId;
        return `✅ Browser launched successfully! Session: ${sessionId}`;
      } else {
        return `❌ Failed to launch browser: ${result.error}`;
      }
    } catch (error) {
      return `❌ Error launching browser: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to navigate
  async navigateTo(url: string): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/copilot/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `navigate to ${url}`,
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      return result.success ? `✅ Navigated to ${url}` : `❌ Navigation failed: ${result.message}`;
    } catch (error) {
      return `❌ Error navigating: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to click elements
  async clickElement(description: string): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/copilot/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `click ${description}`,
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      return result.success ? `✅ Clicked ${description}` : `❌ Click failed: ${result.message}`;
    } catch (error) {
      return `❌ Error clicking: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to type text
  async typeText(text: string, field?: string): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const command = field ? `type "${text}" into ${field}` : `type "${text}"`;
      
      const response = await fetch(`${this.baseUrl}/copilot/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      return result.success ? `✅ Typed: ${text}` : `❌ Type failed: ${result.message}`;
    } catch (error) {
      return `❌ Error typing: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to take screenshots
  async takeScreenshot(fullPage: boolean = false): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/copilot/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: fullPage ? 'take full page screenshot' : 'take screenshot',
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      return result.success ? `✅ Screenshot taken` : `❌ Screenshot failed: ${result.message}`;
    } catch (error) {
      return `❌ Error taking screenshot: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to get page information
  async getPageInfo(): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/copilot/page/${this.currentPageId}/state`);
      const result = await response.json();
      
      if (result.success) {
        const { url, title, elements } = result.pageState;
        return `📄 Page Info:
URL: ${url}
Title: ${title}
Buttons: ${elements.buttons.slice(0, 5).join(', ')}
Links: ${elements.links.slice(0, 5).join(', ')}`;
      } else {
        return `❌ Failed to get page info`;
      }
    } catch (error) {
      return `❌ Error getting page info: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to wait for elements
  async waitFor(condition: string): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/copilot/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `wait for ${condition}`,
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      return result.success ? `✅ Wait condition met: ${condition}` : `❌ Wait failed: ${result.message}`;
    } catch (error) {
      return `❌ Error waiting: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to execute custom commands
  async executeCommand(command: string): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/copilot/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      return result.success ? `✅ Command executed: ${command}` : `❌ Command failed: ${result.message}`;
    } catch (error) {
      return `❌ Error executing command: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to execute workflows
  async executeWorkflow(steps: string[]): Promise<string> {
    if (!this.currentPageId) {
      return `❌ No active browser session. Please launch browser first.`;
    }

    try {
      const workflow = steps.map((step, index) => ({
        name: `step-${index + 1}`,
        command: step
      }));

      const response = await fetch(`${this.baseUrl}/copilot/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow,
          pageId: this.currentPageId
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const summary = result.workflow.map(w => 
          `${w.step}: ${w.result?.success ? '✅' : '❌'}`
        ).join('\n');
        return `🔄 Workflow executed:\n${summary}`;
      } else {
        return `❌ Workflow failed`;
      }
    } catch (error) {
      return `❌ Error executing workflow: ${error.message}`;
    }
  }

  // Function that Copilot Chat can call to close the browser
  async closeBrowser(): Promise<string> {
    if (!this.currentSession) {
      return `❌ No active browser session to close.`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/browser/copilot-${this.currentSession}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        this.currentSession = null;
        this.currentPageId = null;
        return `✅ Browser closed successfully`;
      } else {
        return `❌ Failed to close browser: ${result.error}`;
      }
    } catch (error) {
      return `❌ Error closing browser: ${error.message}`;
    }
  }

  // Helper function to show available commands
  showCommands(): string {
    return `🤖 Available Copilot Commands:

📱 Browser Control:
• launchBrowser(browserType?, headless?) - Launch a new browser
• closeBrowser() - Close the current browser
• navigateTo(url) - Navigate to a URL
• getPageInfo() - Get current page information

🖱️ Interactions:
• clickElement(description) - Click an element
• typeText(text, field?) - Type text into a field
• waitFor(condition) - Wait for a condition
• takeScreenshot(fullPage?) - Take a screenshot

⚡ Advanced:
• executeCommand(command) - Execute any natural language command
• executeWorkflow(steps[]) - Execute multiple commands in sequence

Example usage:
await launchBrowser('chromium', false);
await navigateTo('https://google.com');
await clickElement('search button');
await typeText('hello world', 'search input');`;
  }
}

// Export for use in different environments
export default PlaywrightCopilotClient;

// Global instance for direct use
const playwright = new PlaywrightCopilotClient();

// Make functions available globally for easy Copilot Chat access
if (typeof global !== 'undefined') {
  global.playwright = playwright;
  global.launchBrowser = playwright.launchBrowser.bind(playwright);
  global.navigateTo = playwright.navigateTo.bind(playwright);
  global.clickElement = playwright.clickElement.bind(playwright);
  global.typeText = playwright.typeText.bind(playwright);
  global.takeScreenshot = playwright.takeScreenshot.bind(playwright);
  global.getPageInfo = playwright.getPageInfo.bind(playwright);
  global.waitFor = playwright.waitFor.bind(playwright);
  global.executeCommand = playwright.executeCommand.bind(playwright);
  global.executeWorkflow = playwright.executeWorkflow.bind(playwright);
  global.closeBrowser = playwright.closeBrowser.bind(playwright);
}

// Usage examples for Copilot Chat:
/*

You can now use Copilot Chat like this:

User: "Launch a browser"
Copilot: I'll launch a browser for you!
```javascript
await launchBrowser('chromium', false);
```

User: "Navigate to Google"
Copilot: I'll navigate to Google for you!
```javascript
await navigateTo('https://google.com');
```

User: "Click the search button"
Copilot: I'll click the search button!
```javascript
await clickElement('search button');
```

User: "Type hello world in the search box"
Copilot: I'll type that for you!
```javascript
await typeText('hello world', 'search input');
```

User: "Take a screenshot"
Copilot: I'll take a screenshot!
```javascript
await takeScreenshot();
```

User: "Automate login to a website"
Copilot: I'll create a workflow to automate login!
```javascript
await executeWorkflow([
  'navigate to https://example.com/login',
  'type "username" into username field',
  'type "password" into password field',
  'click login button'
]);
```

*/
