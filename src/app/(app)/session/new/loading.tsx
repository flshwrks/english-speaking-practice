import { SkeletonLines } from "@/components/ui";

/** レッスンの準備画面を開いた直後の骨組み（ナビなしの2カラム） */
export default function Loading() {
  return (
    <main
      role="status"
      aria-label="読み込み中"
      className="mx-auto w-full max-w-[1120px] px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16 lg:px-10 lg:py-10"
    >
      <div>
        <div className="skeleton mb-6 h-5 w-20" />
        <div className="skeleton mb-3 h-7 w-56" />
        <SkeletonLines rows={2} />
      </div>
      <div className="mt-10 lg:mt-0">
        <div className="skeleton mb-4 h-5 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-b border-line py-5">
            <div className="skeleton mb-2 h-5 w-48" />
            <SkeletonLines rows={2} />
          </div>
        ))}
      </div>
    </main>
  );
}
