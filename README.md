# Express MCP Playground

A sleek chat interface to interact with the Express MCP server using Claude.

## Features

- 🎨 Clean black & white aesthetic inspired by Express branding
- 💬 Real-time streaming responses
- 🔧 Expandable tool call visualization
- ⚡ Built with Next.js 15 and React 19

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/express-mcp-playground&env=ANTHROPIC_API_KEY&envDescription=Anthropic%20API%20Key%20required%20for%20Claude&envLink=https://console.anthropic.com/)

## Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/express-mcp-playground.git
   cd express-mcp-playground
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Then edit `.env.local` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```
   
   Get your API key from [Anthropic Console](https://console.anthropic.com/)

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com/new)
3. Add your `ANTHROPIC_API_KEY` environment variable
4. Deploy!

Vercel will automatically detect Next.js and configure the build settings.

## Configuration

### MCP Server URL

By default, this connects to the Express MCP server at:
```
https://penumbra--express-mcp-mcp-server.modal.run/mcp
```

You can modify this in `app/api/express-mcp/route.ts`.

## Tech Stack

- **Framework**: Next.js 15
- **Styling**: Tailwind CSS 4
- **AI**: Anthropic Claude with MCP
- **Language**: TypeScript

## License

MIT

