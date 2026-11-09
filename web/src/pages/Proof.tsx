import EmptyState from '../components/EmptyState'

export default function Proof() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Validation</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">How we know it works</h1>
      </header>
      <EmptyState title="Validation results coming in Phase 5">
        Before/after step test, orbit-drift chart, out-of-sample error and calibration factors by month.
      </EmptyState>
    </div>
  )
}
