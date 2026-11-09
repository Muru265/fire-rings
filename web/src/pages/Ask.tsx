import EmptyState from '../components/EmptyState'

export default function Ask() {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">AI analyst</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">Ask Fire Rings</h1>
      </header>
      <EmptyState title="Analyst coming in Phase 6">
        Plain-English answers grounded only in the harmonized record, with every number traced to its source.
      </EmptyState>
    </div>
  )
}
