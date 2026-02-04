import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// =============================================================================
// Console Proxy - Sends all logs/errors to parent iframe
// =============================================================================
if (window.parent !== window) {
  const sendToParent = (type: string, args: any[]) => {
    try {
      const payload = {
        source: 'vite-app',
        type,
        timestamp: new Date().toISOString(),
        data: args.map(arg => {
          if (arg instanceof Error) {
            return { message: arg.message, stack: arg.stack, name: arg.name }
          }
          try {
            return JSON.parse(JSON.stringify(arg))
          } catch {
            return String(arg)
          }
        })
      }
      window.parent.postMessage(payload, '*')
    } catch (e) {
      // Silently fail if postMessage fails
    }
  }

  // Proxy console methods
  const methods = ['log', 'warn', 'error', 'info', 'debug'] as const
  methods.forEach(method => {
    const original = console[method].bind(console)
    console[method] = (...args: any[]) => {
      sendToParent(method, args)
      original(...args)
    }
  })

  // Capture uncaught errors
  window.addEventListener('error', (event) => {
    sendToParent('error', [{
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || event.error
    }])
  })

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    sendToParent('error', [{
      type: 'unhandledrejection',
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    }])
  })

  // Proxy fetch requests
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method || 'GET'
    const startTime = Date.now()

    sendToParent('network', [{
      type: 'request',
      method,
      url,
      headers: init?.headers,
      body: init?.body ? String(init.body).slice(0, 1000) : undefined,
      timestamp: new Date().toISOString()
    }])

    try {
      const response = await originalFetch(input, init)
      const duration = Date.now() - startTime

      // Clone response to read body without consuming it
      const clone = response.clone()
      let responseBody: any
      try {
        responseBody = await clone.json()
      } catch {
        try {
          responseBody = await clone.text()
          if (responseBody.length > 1000) responseBody = responseBody.slice(0, 1000) + '...'
        } catch {
          responseBody = '[Unable to read body]'
        }
      }

      sendToParent('network', [{
        type: 'response',
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        duration,
        body: responseBody,
        timestamp: new Date().toISOString()
      }])

      return response
    } catch (error: any) {
      const duration = Date.now() - startTime
      sendToParent('network', [{
        type: 'error',
        method,
        url,
        duration,
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      }])
      throw error
    }
  }

  // Proxy XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open
  const originalXHRSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
    (this as any)._proxyData = { method, url: String(url), startTime: 0 }
    return originalXHROpen.apply(this, [method, url, ...args] as any)
  }

  XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const proxyData = (this as any)._proxyData
    proxyData.startTime = Date.now()

    sendToParent('network', [{
      type: 'request',
      source: 'xhr',
      method: proxyData.method,
      url: proxyData.url,
      body: body ? String(body).slice(0, 1000) : undefined,
      timestamp: new Date().toISOString()
    }])

    this.addEventListener('load', () => {
      const duration = Date.now() - proxyData.startTime
      let responseBody = this.responseText
      try {
        responseBody = JSON.parse(this.responseText)
      } catch {
        if (responseBody.length > 1000) responseBody = responseBody.slice(0, 1000) + '...'
      }

      sendToParent('network', [{
        type: 'response',
        source: 'xhr',
        method: proxyData.method,
        url: proxyData.url,
        status: this.status,
        statusText: this.statusText,
        duration,
        body: responseBody,
        timestamp: new Date().toISOString()
      }])
    })

    this.addEventListener('error', () => {
      const duration = Date.now() - proxyData.startTime
      sendToParent('network', [{
        type: 'error',
        source: 'xhr',
        method: proxyData.method,
        url: proxyData.url,
        duration,
        error: 'XHR request failed',
        timestamp: new Date().toISOString()
      }])
    })

    return originalXHRSend.apply(this, [body] as any)
  }

  console.log('[Console Proxy] Enabled - logs & network forwarded to parent iframe')
}
// =============================================================================

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
