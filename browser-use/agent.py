from browser_use import Agent, Browser, BrowserConfig
from langchain_anthropic import ChatAnthropic
import asyncio
import sys

# Configure the browser to connect to your Chrome instance
browser = Browser(
    config=BrowserConfig(
        # Specify the path to your Chrome executable
        chrome_instance_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',  # macOS path
        # For Windows, typically: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        # For Linux, typically: '/usr/bin/google-chrome'
    )
)

# Get task from command line argument or use default
task = "go to naval ravikants linkedin and give me a summary of his achievements"
if len(sys.argv) > 1:
    task = sys.argv[1]
    print(f"Using task from command line: {task}")

# Create the agent with your configured browser
agent = Agent(
    task=task,
    llm=ChatAnthropic(model='claude-3-7-sonnet-20250219'),
    browser=browser,
)

async def main():
    await agent.run()

    input('Press Enter to close the browser...')
    await browser.close()

if __name__ == '__main__':
    asyncio.run(main())