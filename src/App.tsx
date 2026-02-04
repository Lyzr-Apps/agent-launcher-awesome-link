import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AgentInterceptorProvider } from '@/components/AgentInterceptorProvider'
import ErrorBoundary, { GlobalErrorModal } from '@/components/ErrorBoundary'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AgentInterceptorProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AgentInterceptorProvider>
        <GlobalErrorModal />
      </ErrorBoundary>
    </BrowserRouter>
  )
}
