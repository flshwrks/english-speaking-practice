import { Page } from "@/components/ui";

/** 記録を開いた直後の骨組み（数字・グラフ・カレンダー） */
export default function Loading() {
  return (
    <Page>
      <div role="status" aria-label="読み込み中">
        <div className="skeleton mb-8 h-7 w-20" />
        <div className="mb-10 grid grid-cols-2 gap-4 sm:flex sm:gap-10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="skeleton mb-2 h-3 w-14" />
              <div className="skeleton h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="panel h-64" />
          <div className="skeleton h-32" />
        </div>
      </div>
    </Page>
  );
}
