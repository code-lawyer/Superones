type PageIntroProps = {
  code: string;
  title: string;
  lead: string;
  meta?: string;
};

export function PageIntro({ code, title, lead, meta }: PageIntroProps) {
  return (
    <section className="page-intro shell">
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
