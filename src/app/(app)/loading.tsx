import { Page, SkeletonLines } from "@/components/ui";

/** 画面の切り替え中（データを読んでいる間）にすぐ出す骨組み。押した瞬間に反応が返るように */
export default function Loading() {
  return (
    <Page>
      <div role="status" aria-label="読み込み中">
        <div className="skeleton mb-2 h-7 w-48" />
        <div className="skeleton mb-8 h-4 w-32" />
        <div className="panel mb-8 p-5 lg:p-7">
          <SkeletonLines rows={2} className="mb-6" />
          <SkeletonLines rows={4} />
        </div>
        <SkeletonLines rows={5} />
      </div>
    </Page>
  );
}
