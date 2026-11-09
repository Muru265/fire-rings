import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import Landing from './pages/Landing'
import Region from './pages/Region'
import Proof from './pages/Proof'
import Data from './pages/Data'
import Ask from './pages/Ask'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Landing />} />
        <Route path="r/:regionId" element={<Region />} />
        <Route path="proof" element={<Proof />} />
        <Route path="data" element={<Data />} />
        <Route path="ask" element={<Ask />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
