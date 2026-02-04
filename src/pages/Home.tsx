import { useState } from 'react'
import { callAIAgent } from '@/utils/aiAgent'
import type { NormalizedAgentResponse } from '@/utils/aiAgent'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Loader2,
  Shield,
  TrendingUp,
  Package,
  AlertTriangle,
  Download,
  Search,
  Globe,
  Target,
  Lightbulb,
  CheckCircle,
  XCircle,
  Brain,
  Eye
} from 'lucide-react'

// Agent ID from workflow.json
const CI_ORCHESTRATOR_AGENT_ID = "6982de831ae7615e896e00f5"

// TypeScript interfaces based on actual response schemas
interface ProductIntelligence {
  core_features: string
  positioning: string
  unique_differentiators: string
  gaps_vs_lyzr: string
}

interface MarketSignals {
  predicted_next_moves: string
  threat_analysis: string
  recommended_strategies: string[]
}

interface WebResearchSource {
  title: string
  url?: string
  relevance: number
}

interface WebResearch {
  answer: string
  sources: WebResearchSource[]
  confidence: number
  related_topics: string[]
  follow_up_questions?: string[]
}

interface SubAgentResult {
  agent_name: string
  status: string
  output: ProductIntelligence | MarketSignals | WebResearch | any
}

interface CIReport {
  final_output: any
  sub_agent_results: SubAgentResult[]
  summary: string
  workflow_completed: boolean
}

// Inline Components
function ThreatBadge({ threatLevel }: { threatLevel: 'Low' | 'Medium' | 'High' }) {
  const colors = {
    Low: 'bg-green-500/20 text-green-400 border-green-500/50',
    Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    High: 'bg-red-500/20 text-red-400 border-red-500/50'
  }

  const icons = {
    Low: Shield,
    Medium: AlertTriangle,
    High: AlertTriangle
  }

  const Icon = icons[threatLevel]

  return (
    <Badge variant="outline" className={`${colors[threatLevel]} border px-3 py-1 text-sm font-semibold`}>
      <Icon className="w-4 h-4 mr-1.5" />
      {threatLevel} Threat
    </Badge>
  )
}

function SectionCard({
  title,
  content,
  icon: Icon,
  iconColor = "text-blue-400"
}: {
  title: string
  content: string | string[]
  icon: any
  iconColor?: string
}) {
  return (
    <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gray-700/50 ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <CardTitle className="text-lg text-gray-100">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {Array.isArray(content) ? (
          <ul className="space-y-2">
            {content.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-300">
                <CheckCircle className="w-4 h-4 mt-0.5 text-green-400 flex-shrink-0" />
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-300 text-sm leading-relaxed">{content}</p>
        )}
      </CardContent>
    </Card>
  )
}

function SourceCard({ source }: { source: WebResearchSource }) {
  return (
    <div className="p-3 rounded-lg bg-gray-700/30 border border-gray-600/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h4 className="text-sm font-medium text-gray-200 mb-1">{source.title}</h4>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 break-all"
            >
              {source.url}
            </a>
          )}
        </div>
        <Badge variant="outline" className="text-xs bg-gray-700 text-gray-300 border-gray-600">
          {Math.round(source.relevance * 100)}%
        </Badge>
      </div>
    </div>
  )
}

export default function Home() {
  const [competitor, setCompetitor] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<CIReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rawResponse, setRawResponse] = useState<any>(null)

  // Derive threat level from threat_analysis text
  const getThreatLevel = (): 'Low' | 'Medium' | 'High' => {
    if (!report) return 'Low'

    const marketSignals = report.sub_agent_results?.find(
      r => r.agent_name === 'Market Signals Agent'
    )

    if (marketSignals?.output?.threat_analysis) {
      const threatText = marketSignals.output.threat_analysis.toLowerCase()
      if (threatText.includes('high') || threatText.includes('significant') || threatText.includes('major')) {
        return 'High'
      }
      if (threatText.includes('moderate') || threatText.includes('medium')) {
        return 'Medium'
      }
    }

    return 'Low'
  }

  const handleAnalyze = async () => {
    if (!competitor.trim()) {
      setError('Please enter a competitor name')
      return
    }

    setLoading(true)
    setError(null)
    setReport(null)
    setRawResponse(null)

    try {
      const result = await callAIAgent(
        `Analyze competitor: ${competitor}. Provide comprehensive competitive intelligence including latest activity, product analysis, and strategic predictions.`,
        CI_ORCHESTRATOR_AGENT_ID,
        {
          user_id: 'ci-dashboard-user',
          session_id: `ci-${Date.now()}`
        }
      )

      setRawResponse(result)

      if (result.success && result.response.status === 'success') {
        setReport(result.response.result)
      } else {
        setError(result.response.message || result.error || 'Analysis failed. Please try again.')
      }
    } catch (e) {
      setError('Network error. Please check your connection and try again.')
      console.error('CI Analysis error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadReport = () => {
    if (!report) return

    const reportData = {
      competitor_name: competitor,
      timestamp: new Date().toISOString(),
      threat_level: getThreatLevel(),
      ...report
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CI-Report-${competitor.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Extract sub-agent results
  const productIntelligence = report?.sub_agent_results?.find(
    r => r.agent_name === 'Product Intelligence Agent'
  )?.output as ProductIntelligence | undefined

  const marketSignals = report?.sub_agent_results?.find(
    r => r.agent_name === 'Market Signals Agent'
  )?.output as MarketSignals | undefined

  const webResearch = report?.sub_agent_results?.find(
    r => r.agent_name === 'Web Research Agent'
  )?.output as WebResearch | undefined

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-md border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Competitive Intelligence Dashboard</h1>
                <p className="text-sm text-gray-400">Powered by Lyzr AI</p>
              </div>
            </div>
            {report && (
              <Button
                onClick={handleDownloadReport}
                variant="outline"
                className="bg-gray-800 text-gray-200 border-gray-600 hover:bg-gray-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Input Section */}
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm mb-8">
          <CardHeader>
            <CardTitle className="text-xl text-gray-100 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-400" />
              Analyze Competitor
            </CardTitle>
            <CardDescription className="text-gray-400">
              Enter a competitor name to generate comprehensive intelligence report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="competitor" className="text-gray-300 mb-2 block">
                  Competitor Name
                </Label>
                <Input
                  id="competitor"
                  type="text"
                  placeholder="e.g., LangChain, CrewAI, AutoGPT"
                  value={competitor}
                  onChange={(e) => setCompetitor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      handleAnalyze()
                    }
                  }}
                  disabled={loading}
                  className="bg-gray-700 border-gray-600 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAnalyze}
                  disabled={loading || !competitor.trim()}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Analyze
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="bg-red-900/20 border-red-700/50 mb-8">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-red-400 font-semibold mb-1">Analysis Failed</h3>
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-200 mb-2">
                    Analyzing {competitor}...
                  </h3>
                  <p className="text-sm text-gray-400">
                    Coordinating intelligence agents • Gathering data • Analyzing signals
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report Display */}
        {report && !loading && (
          <div className="space-y-6">
            {/* Report Header */}
            <Card className="bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">{competitor}</h2>
                    <p className="text-gray-400 text-sm">
                      Intelligence Report • Last Updated: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                    </p>
                  </div>
                  <ThreatBadge threatLevel={getThreatLevel()} />
                </div>

                {report.summary && (
                  <>
                    <Separator className="my-4 bg-gray-700" />
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="text-sm font-semibold text-gray-300 mb-1">Executive Summary</h3>
                        <p className="text-gray-400 text-sm">{report.summary}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Web Research / Latest Activity */}
            {webResearch && (
              <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-gray-700/50 text-green-400">
                      <Globe className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg text-gray-100">Latest Activity & Market Intelligence</CardTitle>
                  </div>
                  {webResearch.confidence !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Confidence:</span>
                      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">
                        {Math.round(webResearch.confidence * 100)}%
                      </Badge>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-300 text-sm leading-relaxed">{webResearch.answer}</p>

                  {webResearch.sources && webResearch.sources.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">Sources</h4>
                      <div className="space-y-2">
                        {webResearch.sources.map((source, i) => (
                          <SourceCard key={i} source={source} />
                        ))}
                      </div>
                    </div>
                  )}

                  {webResearch.related_topics && webResearch.related_topics.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">Related Topics</h4>
                      <div className="flex flex-wrap gap-2">
                        {webResearch.related_topics.map((topic, i) => (
                          <Badge key={i} variant="outline" className="bg-gray-700 text-gray-300 border-gray-600">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Product Intelligence */}
            {productIntelligence && (
              <div className="grid md:grid-cols-2 gap-6">
                <SectionCard
                  title="Core Features"
                  content={productIntelligence.core_features}
                  icon={Package}
                  iconColor="text-purple-400"
                />
                <SectionCard
                  title="Market Positioning"
                  content={productIntelligence.positioning}
                  icon={Target}
                  iconColor="text-blue-400"
                />
                <SectionCard
                  title="Unique Differentiators"
                  content={productIntelligence.unique_differentiators}
                  icon={TrendingUp}
                  iconColor="text-green-400"
                />
                <SectionCard
                  title="Gaps vs. Lyzr"
                  content={productIntelligence.gaps_vs_lyzr}
                  icon={Shield}
                  iconColor="text-yellow-400"
                />
              </div>
            )}

            {/* Market Signals & Strategic Analysis */}
            {marketSignals && (
              <div className="space-y-6">
                <SectionCard
                  title="Predicted Next Moves"
                  content={marketSignals.predicted_next_moves}
                  icon={Brain}
                  iconColor="text-cyan-400"
                />

                <SectionCard
                  title="Threat Analysis"
                  content={marketSignals.threat_analysis}
                  icon={AlertTriangle}
                  iconColor="text-orange-400"
                />

                {marketSignals.recommended_strategies && marketSignals.recommended_strategies.length > 0 && (
                  <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-700/50 backdrop-blur-sm">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-700/50 text-blue-400">
                          <Lightbulb className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-lg text-gray-100">Recommended Strategic Actions</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-[300px]">
                        <ul className="space-y-3">
                          {marketSignals.recommended_strategies.map((strategy, i) => (
                            <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30 border border-gray-700/50">
                              <CheckCircle className="w-5 h-5 mt-0.5 text-blue-400 flex-shrink-0" />
                              <span className="text-sm text-gray-300 leading-relaxed">{strategy}</span>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Workflow Status */}
            {report.workflow_completed && (
              <Card className="bg-green-900/20 border-green-700/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-green-400 font-semibold">
                      Analysis Complete • All intelligence agents coordinated successfully
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Debug: Raw Response (for development) */}
            {rawResponse && process.env.NODE_ENV === 'development' && (
              <details className="mt-8">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-400">
                  Show Raw Response (Debug)
                </summary>
                <pre className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-400 overflow-auto max-h-96">
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !report && !error && (
          <Card className="bg-gray-800/30 border-gray-700/50 border-dashed">
            <CardContent className="py-16">
              <div className="text-center">
                <div className="inline-flex p-4 rounded-full bg-gray-700/50 mb-4">
                  <Brain className="w-12 h-12 text-gray-500" />
                </div>
                <h3 className="text-xl font-semibold text-gray-300 mb-2">
                  Ready to Analyze Competitors
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Enter a competitor name above to generate comprehensive intelligence reports powered by AI agents
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              <span>Powered by Lyzr AI Agent Framework</span>
            </div>
            <div>
              {report && (
                <span>Last analyzed: {new Date().toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
