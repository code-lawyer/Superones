import type { ReactNode } from "react";

type PageIntroProps = {
  code: string;
  title: ReactNode;
  lead: string;
  meta?: string;
  className?: string;
};

export function PageIntro({ code, title, lead, meta, className }: PageIntroProps) {
  return (
    <section className={`page-intro shell${className ? ` ${className}` : ""}`}>
      <p className="eyebrow mono">{code}</p>
      <div className="page-intro__grid">
        <h1>{title}</h1>
        <div className="page-intro__copy">
          <p>{lead}</p>
          {meta ? <p className="mono muted page-intro__meta">{meta}</p> : null}
        </div>
      </div>
    </section>
  );
}
