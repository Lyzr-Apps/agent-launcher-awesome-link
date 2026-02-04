/**
 * MAIN PAGE - Build your UI here!
 *
 * FILE STRUCTURE:
 * - src/pages/Home.tsx    <- YOU ARE HERE - main page
 * - src/App.tsx           <- root app with routing
 * - src/main.tsx          <- entry point
 * - src/components/ui/    <- shadcn/ui components
 * - src/lib/utils.ts      <- cn() helper
 */

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">
          Ready to Build Something Amazing!
        </h1>
        <p className="text-gray-300 text-lg">
          Vite + React + TypeScript + Tailwind CSS
        </p>
      </div>
    </div>
  )
}
