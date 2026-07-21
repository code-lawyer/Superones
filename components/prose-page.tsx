import Link from "next/link";

type Section = { title: string; paragraphs: string[] };

export function ProsePage({ code, title, lead, sections }: { code: string; title: string; lead: string; sections: Section[] }) {
  return (
    <article className="prose-page shell">
      <header>
        <p className="eyebrow mono">{code}</p>
        <h1>{title}</h1>
        <p className="detail-lead">{lead}</p>
      </header>
      <div className="prose-layout">
        <nav aria-label="本页目录">
          {sections.map((section, index) => <a key={section.title} href={`#section-${index + 1}`}>{String(index + 1).padStart(2, "0")} / {section.title}</a>)}
        </nav>
        <div className="prose-content">
          {sections.map((section, index) => (
            <section id={`section-${index + 1}`} key={section.title}>
              <p className="eyebrow mono">{String(index + 1).padStart(2, "0")}</p>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <Link className="text-link" href="/">返回首页</Link>
        </div>
      </div>
    </article>
  );
}
