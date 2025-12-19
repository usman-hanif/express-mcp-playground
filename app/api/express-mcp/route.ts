import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

// Default Express MCP URL
const DEFAULT_MCP_URL = 'https://penumbra--express-mcp-mcp-server.modal.run/mcp'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

/**
 * API endpoint for MCP chat
 * Uses Claude with any MCP server
 */
export async function POST(request: NextRequest) {
  try {
    const { messages, mcpUrl } = await request.json()

    if (!messages || messages.length === 0) {
      return Response.json(
        { error: 'Messages are required' },
        { status: 400 }
      )
    }

    const finalMcpUrl = mcpUrl || DEFAULT_MCP_URL

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((msg: Message) => ({
      role: msg.role,
      content: msg.content,
    }))

    // Create streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Build request with MCP support
          const requestOptions: Anthropic.MessageCreateParamsNonStreaming & {
            mcp_servers?: Array<{ type: string; url: string; name: string }>
          } = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: `You are a helpful AI assistant with access to tools via MCP (Model Context Protocol). Use the available tools to help users accomplish their tasks. Be concise, helpful, and use tools when appropriate to provide accurate, real-time information.`,
            messages: anthropicMessages,
            mcp_servers: [{
              type: 'url',
              url: finalMcpUrl,
              name: 'mcp-tools',
            }]
          }

          const headers = { 'anthropic-beta': 'mcp-client-2025-04-04' }

          console.log('📤 MCP Request to:', finalMcpUrl)

          // Make streaming request
          const response = await client.messages.stream(requestOptions, { headers })

          let currentToolName = ''
          let currentToolInput = ''
          let currentToolId = ''

          for await (const event of response) {
            // Debug log all events
            console.log('📨 Event:', event.type, JSON.stringify(event).slice(0, 200))
            
            if (event.type === 'content_block_start') {
              const block = event.content_block as { type: string; name?: string; id?: string }
              console.log('📦 Content block:', block.type, block.name)
              
              // Handle both regular tool_use and MCP tool calls
              if ((block.type === 'tool_use' || block.type === 'mcp_tool_use') && block.name) {
                currentToolName = block.name
                currentToolId = block.id || ''
                currentToolInput = ''
                // Send tool start event
                const data = `data: ${JSON.stringify({ 
                  type: 'tool_start', 
                  name: currentToolName,
                  id: currentToolId
                })}\n\n`
                controller.enqueue(encoder.encode(data))
              }
            } else if (event.type === 'content_block_delta') {
              const delta = event.delta as { type: string; text?: string; partial_json?: string }
              if (delta.type === 'text_delta' && delta.text) {
                const data = `data: ${JSON.stringify({ type: 'text', content: delta.text })}\n\n`
                controller.enqueue(encoder.encode(data))
              } else if (delta.type === 'input_json_delta' && delta.partial_json) {
                currentToolInput += delta.partial_json
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolName) {
                // Send tool complete event with input
                let parsedInput = {}
                try {
                  parsedInput = JSON.parse(currentToolInput)
                } catch {
                  parsedInput = currentToolInput ? { raw: currentToolInput } : {}
                }
                const data = `data: ${JSON.stringify({ 
                  type: 'tool_complete', 
                  name: currentToolName,
                  id: currentToolId,
                  input: parsedInput
                })}\n\n`
                controller.enqueue(encoder.encode(data))
                currentToolName = ''
                currentToolInput = ''
                currentToolId = ''
              }
            } else if (event.type === 'message_stop') {
              const data = `data: ${JSON.stringify({ type: 'done' })}\n\n`
              controller.enqueue(encoder.encode(data))
            }
          }

          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          const errorData = `data: ${JSON.stringify({ 
            type: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })}\n\n`
          controller.enqueue(encoder.encode(errorData))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('MCP error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

