'use client'

import { useState, useRef, useEffect } from 'react'

interface ToolCall {
  name: string
  id?: string
  input?: Record<string, unknown>
  status: 'running' | 'complete'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

// Simple markdown renderer
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null
  
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  
  lines.forEach((line, lineIndex) => {
    let processed: React.ReactNode = line
    
    // Headers
    if (line.startsWith('## ')) {
      processed = <h2 key={lineIndex} className="text-lg font-bold mt-4 mb-2">{line.slice(3)}</h2>
      elements.push(processed)
      return
    }
    if (line.startsWith('# ')) {
      processed = <h1 key={lineIndex} className="text-xl font-bold mt-4 mb-2">{line.slice(2)}</h1>
      elements.push(processed)
      return
    }
    
    // Process inline formatting (bold)
    const parts: React.ReactNode[] = []
    let remaining = line
    let partIndex = 0
    
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      if (boldMatch && boldMatch.index !== undefined) {
        // Add text before bold
        if (boldMatch.index > 0) {
          parts.push(<span key={`${lineIndex}-${partIndex++}`}>{remaining.slice(0, boldMatch.index)}</span>)
        }
        // Add bold text
        parts.push(<strong key={`${lineIndex}-${partIndex++}`} className="font-semibold">{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      } else {
        parts.push(<span key={`${lineIndex}-${partIndex++}`}>{remaining}</span>)
        break
      }
    }
    
    // List items
    if (line.startsWith('- ')) {
      elements.push(
        <div key={lineIndex} className="flex gap-2 ml-2 my-1">
          <span className="text-neutral-400">•</span>
          <span>{parts.length > 0 ? parts : line.slice(2)}</span>
        </div>
      )
      return
    }
    
    // Regular paragraph
    if (line.trim() === '') {
      elements.push(<div key={lineIndex} className="h-2" />)
    } else {
      elements.push(<p key={lineIndex} className="my-1">{parts.length > 0 ? parts : line}</p>)
    }
  })
  
  return <>{elements}</>
}

// Tool call pill component (like Uber example)
function ToolCallPill({ tool, isExpanded, onToggle }: { 
  tool: ToolCall
  isExpanded: boolean
  onToggle: () => void 
}) {
  return (
    <div className="inline-block my-1">
      <button
        onClick={onToggle}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
          tool.status === 'running'
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${tool.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500'}`} />
        <span className="text-emerald-700 font-medium">{tool.name}</span>
        {tool.status === 'complete' && (
          <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {tool.status === 'running' && (
          <div className="h-3 w-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
        )}
      </button>
      
      {/* Expanded details */}
      {isExpanded && tool.input && (
        <div className="mt-2 ml-2 p-3 bg-neutral-900 rounded-lg overflow-x-auto max-w-md">
          <pre className="text-xs text-neutral-300 font-mono whitespace-pre-wrap">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function ExpressMcpPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const toggleToolExpanded = (toolKey: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(toolKey)) {
        next.delete(toolKey)
      } else {
        next.add(toolKey)
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    // Add empty assistant message to show typing
    setMessages([...newMessages, { role: 'assistant', content: '', toolCalls: [] }])

    try {
      const response = await fetch('/api/express-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')

      const decoder = new TextDecoder()
      let currentContent = ''
      let currentToolCalls: Message['toolCalls'] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              console.log('📨 Received event:', data.type, data)
              
              if (data.type === 'text') {
                currentContent += data.content
                setMessages([...newMessages, { 
                  role: 'assistant', 
                  content: currentContent,
                  toolCalls: currentToolCalls 
                }])
              } else if (data.type === 'tool_start') {
                console.log('🔧 Tool started:', data.name)
                const toolId: string = data.id || `tool-${(currentToolCalls || []).length}`
                currentToolCalls = [...(currentToolCalls || []), { 
                  name: data.name,
                  id: toolId,
                  status: 'running' as const
                }]
                setMessages([...newMessages, { 
                  role: 'assistant', 
                  content: currentContent,
                  toolCalls: currentToolCalls 
                }])
              } else if (data.type === 'tool_complete') {
                console.log('✅ Tool completed:', data.name, data.input)
                currentToolCalls = (currentToolCalls || []).map(tc => {
                  if (data.id && tc.id === data.id) {
                    return { ...tc, status: 'complete' as const, input: data.input }
                  }
                  if (!data.id && tc.name === data.name && tc.status === 'running') {
                    return { ...tc, status: 'complete' as const, input: data.input }
                  }
                  return tc
                })
                setMessages([...newMessages, { 
                  role: 'assistant', 
                  content: currentContent,
                  toolCalls: currentToolCalls 
                }])
              } else if (data.type === 'error') {
                setMessages([...newMessages, { 
                  role: 'assistant', 
                  content: `Error: ${data.error}` 
                }])
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: 'Sorry, something went wrong. Please try again.' 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,0,0,0.03),transparent_70%)]" />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden relative">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 pt-20">
            {/* Hero Content */}
            <div className="text-center max-w-xl">
              {/* Logo with subtle animation */}
              <div className="mb-8">
                <h1 className="text-7xl md:text-8xl font-black text-black tracking-tighter select-none">
                  EXPRESS
                </h1>
                <div className="h-1 w-24 bg-black mx-auto mt-4" />
              </div>
              
              <p className="text-base text-neutral-500 mb-12 tracking-wide">
                MCP Playground
              </p>

              {/* Glassmorphic quick prompts */}
              <div className="flex flex-wrap justify-center gap-4">
                {[
                  { text: 'What tools are available?', icon: '⚡' },
                  { text: 'Show me products', icon: '🛍️' },
                  { text: 'Help me get started', icon: '→' },
                ].map((prompt) => (
                  <button
                    key={prompt.text}
                    onClick={() => setInput(prompt.text)}
                    className="group px-6 py-3 text-sm text-black bg-white/70 hover:bg-white backdrop-blur-xl border border-white/50 hover:border-neutral-300 rounded-2xl transition-all duration-300 shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 hover:-translate-y-0.5"
                  >
                    <span className="mr-2 opacity-60 group-hover:opacity-100 transition-opacity">{prompt.icon}</span>
                    {prompt.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-4 py-8">
            <div className="max-w-2xl mx-auto space-y-6">
              {messages.map((message, messageIndex) => (
                <div
                  key={messageIndex}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'user' ? (
                    <div className="max-w-[85%] bg-black text-white rounded-2xl rounded-br-md px-5 py-3 shadow-lg shadow-black/20">
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[85%] bg-white border border-neutral-200 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm">
                      {/* Tool calls as inline pills */}
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {message.toolCalls.map((tool, toolIndex) => {
                            const toolKey = `${messageIndex}-${toolIndex}`
                            return (
                              <ToolCallPill
                                key={toolKey}
                                tool={tool}
                                isExpanded={expandedTools.has(toolKey)}
                                onToggle={() => toggleToolExpanded(toolKey)}
                              />
                            )
                          })}
                        </div>
                      )}
                      
                      {/* Message content with markdown */}
                      <div className="text-black leading-relaxed">
                        {message.content ? (
                          renderMarkdown(message.content)
                        ) : (
                          isLoading && !message.toolCalls?.length && (
                            <div className="flex items-center gap-2 text-neutral-400">
                              <div className="flex gap-1">
                                <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-neutral-200 bg-white/80 backdrop-blur-xl px-4 py-5">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="relative">
            <div className="relative flex items-center gap-3 bg-white border border-neutral-200 rounded-2xl px-4 py-3 shadow-lg shadow-black/5 focus-within:shadow-xl focus-within:shadow-black/10 focus-within:border-neutral-300 transition-all duration-300">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                placeholder="Message Express..."
                className="flex-1 bg-transparent text-black placeholder:text-neutral-400 focus:outline-none text-sm h-6"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="shrink-0 p-3 bg-black hover:bg-neutral-800 disabled:bg-neutral-200 disabled:cursor-not-allowed rounded-xl transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-neutral-400 mt-3">
            Press <kbd className="px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 rounded text-neutral-500 font-mono text-[10px]">Enter</kbd> to send
          </p>
        </form>
      </div>
    </div>
  )
}

