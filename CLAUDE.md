# Vite React Frontend

## Import Rules

**Icons:** `lucide-react` ONLY (never react-icons)
```tsx
import { Loader2, Send, X } from 'lucide-react'
```

**Components:** `@/components/ui/*` (shadcn only)
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
```

**Agent Calls:** `@/utils/aiAgent`
```tsx
import { callAIAgent } from '@/utils/aiAgent'
```

---

## Icon Reference (lucide-react)

| Need | Icon | Usage |
|------|------|-------|
| Loading | `Loader2` | `<Loader2 className="animate-spin" />` |
| Send | `Send` | Submit buttons |
| Refresh | `RefreshCw` | Reload/retry |
| Close | `X` | Modal close, dismiss |
| Add | `Plus` | Create new items |
| Delete | `Trash2` | Remove items |
| Edit | `Pencil` | Edit mode |
| Success | `CheckCircle` | Success states |
| Error | `XCircle` | Error states |
| Warning | `AlertTriangle` | Warning states |
| Info | `Info` | Information |
| Search | `Search` | Search inputs |
| User | `User` | User profiles |
| Settings | `Settings` | Configuration |
| Menu | `Menu` | Hamburger menu |
| Arrow | `ChevronRight` | Navigation |
| External | `ExternalLink` | External links |
| Copy | `Copy` | Copy to clipboard |
| Download | `Download` | Download files |
| Upload | `Upload` | Upload files |

---

## callAIAgent Response (GUARANTEED)

```tsx
const result = await callAIAgent(message, AGENT_ID)

// Structure is ALWAYS:
result.success          // boolean - API call succeeded?
result.response.status  // "success" | "error" - agent status
result.response.result  // { ...agent data } - YOUR FIELDS HERE
result.response.message // string | undefined - optional message
```

### Complete Usage Example
```tsx
const [loading, setLoading] = useState(false)
const [data, setData] = useState<any>(null)
const [error, setError] = useState<string | null>(null)

const handleSubmit = async () => {
  setLoading(true)
  setError(null)

  const result = await callAIAgent(userMessage, AGENT_ID)

  if (result.success && result.response.status === 'success') {
    setData(result.response.result)
  } else {
    setError(result.response.message || 'Request failed')
  }

  setLoading(false)
}
```

### Accessing Response Fields
```tsx
// If agent returns: { status: "success", result: { answer: "...", sources: [] } }
const answer = result.response.result.answer
const sources = result.response.result.sources

// ALWAYS use optional chaining for safety
const answer = result.response?.result?.answer ?? 'No answer'
```

---

## UI Code Location

**CRITICAL:**
- ALL UI code goes in `src/pages/Home.tsx`
- Define components inline within Home.tsx
- NEVER create files in `src/components/` (reserved for shadcn/ui)

```tsx
// src/pages/Home.tsx

// Define inline components
const ChatMessage = ({ message }: { message: string }) => (
  <div className="p-4 bg-muted rounded-lg">{message}</div>
)

const ResultCard = ({ data }: { data: any }) => (
  <Card>
    <CardContent>{data.answer}</CardContent>
  </Card>
)

// Main page component
export default function Home() {
  return (
    <div>
      <ChatMessage message="Hello" />
      <ResultCard data={{ answer: "World" }} />
    </div>
  )
}
```

---

## Response Schema Integration

**MANDATORY WORKFLOW:**
1. READ `response_schemas/<agent>_response.json` FIRST
2. Create TypeScript interface matching schema EXACTLY
3. Access fields via `result.response.result.fieldName`
4. NEVER invent field names - use schema only

```tsx
// 1. Read schema file: response_schemas/qa_agent_response.json
// {
//   "answer_text": "string",
//   "sources": ["array"],
//   "confidence_score": "number"
// }

// 2. Create matching interface
interface QAAgentResult {
  answer_text: string
  sources: string[]
  confidence_score: number
}

// 3. Type your state
const [result, setResult] = useState<QAAgentResult | null>(null)

// 4. Access correctly
{result && (
  <div>
    <p>{result.answer_text}</p>
    <span>Confidence: {result.confidence_score}</span>
  </div>
)}
```

---

## Anti-Hallucination Checklist

Before writing UI code:
- [ ] Read workflow.json for agent_ids?
- [ ] Read response_schemas/*.json for field names?
- [ ] Interfaces match schema exactly?
- [ ] Using optional chaining (?.)?
- [ ] Loading/error states handled?
- [ ] Only lucide-react icons?
- [ ] Only shadcn/ui components?

---

## Available shadcn/ui Components

```
accordion, alert, alert-dialog, aspect-ratio, avatar, badge,
breadcrumb, button, calendar, card, carousel, chart, checkbox,
collapsible, command, context-menu, dialog, drawer, dropdown-menu,
form, hover-card, input, input-otp, label, menubar, navigation-menu,
pagination, popover, progress, radio-group, resizable, scroll-area,
select, separator, sheet, sidebar, skeleton, slider, sonner, switch,
table, tabs, textarea, toast, toggle, toggle-group, tooltip
```

Import from `@/components/ui/<component-name>`

---

## Environment Variables

Access via `import.meta.env`:
```tsx
const AGENT_ID = import.meta.env.VITE_AGENT_ID
const API_KEY = import.meta.env.VITE_LYZR_API_KEY
```

Define in `.env`:
```
VITE_AGENT_ID=your-agent-id
VITE_LYZR_API_KEY=your-api-key
```
