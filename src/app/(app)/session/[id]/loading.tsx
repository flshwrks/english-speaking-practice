import { Page, SkeletonLines } from "@/components/ui";

/** フィードバックを開いた直後の骨組み（見出し・講評・スコア・添削の形） */
export default function Loading() {
  return (
    <Page
      rail={
        <div className="hidden flex-col gap-3 lg:flex" aria-hidden>
          <div className="skeleton h-8 w-16" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-3" />
          ))}
        </div>
      }
    >
      <div role="status" aria-label="読み込み中">
        <div className="skeleton mb-4 h-5 w-20" />
        <div className="skeleton mb-2 h-7 w-56" />
        <div className="skeleton mb-8 h-4 w-32" />
        <SkeletonLines rows={4} className="mb-10 max-w-[38em]" />
        <div className="panel divide-y divide-line">
          {[0, 1].map((i) => (
            <div key={i} className="px-4 py-5 sm:px-6">
              <div className="skeleton mb-3 h-3 w-28" />
              <SkeletonLines rows={2} />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
