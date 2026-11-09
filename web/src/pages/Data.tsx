import EmptyState from '../components/EmptyState'

export default function Data() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Open data</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">The harmonized record</h1>
      </header>
      <EmptyState title="Downloads coming in Phase 5">
        Harmonized monthly CSV, calibration factors, validation JSON, data dictionary and a static JSON API.
      </EmptyState>
    </div>
  )
}
