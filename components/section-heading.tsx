import Link from "next/link";

type SectionHeadingProps = {
  code: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
};

export function SectionHeading({ code, title, description, href, linkLabel = "查看全部" }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <p className="eyebrow mono">{code}</p>
      <div className="section-heading__main">
        <div>
          <h2>{title}</h2>
          {description ? <p className="section-description">{description}</p> : null}
        </div>
        {href ? <Link className="text-link section-link" href={href}>{linkLabel}</Link> : null}
      </div>
    </div>
  );
}
