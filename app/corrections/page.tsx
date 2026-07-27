import type { Metadata } from "next";
import { CorrectionForm } from "./correction-form";

export const metadata: Metadata = { title: "纠错" };
export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialType = first(params.type) === "event" ? "event" : "information";
  return (
    <section className="submission-page shell" aria-label="公开纠错">
      <header className="submission-intro">
        <p className="eyebrow mono">CORRECTIONS / PUBLIC RECORD</p>
        <h1>错误需要被看见，也需要被修正。</h1>
        <p>只受理误合并、信息错误和来源失效。请提供可核验的原始依据；已发布事件不会由 LLM 因此自动修改。</p>
      </header>
      <CorrectionForm initialRecord={first(params.record) ?? ""} initialType={initialType} />
    </section>
  );
}
