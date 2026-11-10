import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { lazy, Suspense } from 'react'
import Landing from './pages/Landing'
import Region from './pages/Region'
import NotFound from './pages/NotFound'

const Proof = lazy(() => import('./pages/Proof'))
const Data = lazy(() => import('./pages/Data'))
const Ask = lazy(() => import('./pages/Ask'))
const Story = lazy(() => import('./pages/Story'))
const Guide = lazy(() => import('./pages/Guide'))
const Watch = lazy(() => import('./pages/Watch'))
const page = (el: React.ReactNode) => <Suspense fallback={<div className="card h-[50vh] animate-pulse" />}>{el}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Landing />} />
        <Route path="r/:regionId" element={<Region />} />
        <Route path="proof" element={page(<Proof />)} />
        <Route path="data" element={page(<Data />)} />
        <Route path="ask" element={page(<Ask />)} />
        <Route path="guide" element={page(<Guide />)} />
        <Route path="watch" element={page(<Watch />)} />
        <Route path="story" element={page(<Story />)} />
        <Route path="story/:regionId" element={page(<Story />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
