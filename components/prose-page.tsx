import Link from "next/link";

type Section = { title: string; paragraphs: string[] };
type RelatedLink = { href: string; label: string };

export function ProsePage({
  code,
  title,
  lead,
  sections,
  relatedLinks = [],
}: {
  code: string;
  title: string;
  lead: string;
  sections: Section[];
  relatedLinks?: RelatedLink[];
}) {
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
          {relatedLinks.length > 0 ? (
            <section aria-labelledby="related-legal-documents">
              <p className="eyebrow mono">RELATED</p>
              <h2 id="related-legal-documents">相关文件</h2>
              {relatedLinks.map((item) => (
                <p key={item.href}><Link className="text-link" href={item.href}>{item.label}</Link></p>
              ))}
            </section>
          ) : null}
          <Link className="text-link" href="/">返回首页</Link>
        </div>
      </div>
    </article>
  );
}
