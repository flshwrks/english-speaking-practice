import { Page } from "@/components/ui";

/** 表現の一覧を開いた直後の骨組み（見出し・タブ・辞書の項目） */
export default function Loading() {
  return (
    <Page>
      <div role="status" aria-label="読み込み中">
        <div className="skeleton mb-2 h-7 w-20" />
        <div className="skeleton mb-8 h-4 w-44" />
        <div className="mb-6 flex gap-6 border-b border-line pb-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-4 w-14" />
          ))}
        </div>
        <div className="divide-y divide-line">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="py-5">
              <div className="skeleton mb-2 h-5 w-40" />
              <div className="skeleton mb-3 h-4 w-56" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
