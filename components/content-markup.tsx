import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  inferContentFormat,
  safeMarkdownUrl,
  type ContentFormat,
} from "@/lib/content-markup";

export function ContentMarkup({
  content,
  format,
  className = "",
}: {
  content: string;
  format?: ContentFormat;
  className?: string;
}) {
  const resolvedFormat = format ?? inferContentFormat(content);
  const classes = ["content-markup", className].filter(Boolean).join(" ");

  if (resolvedFormat === "plain_text") {
    const paragraphs = content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    return (
      <div className={classes} data-content-format={resolvedFormat}>
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    );
  }

  return (
    <div className={classes} data-content-format={resolvedFormat}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeMarkdownUrl(url) ?? ""}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          h4: ({ children }) => <h5>{children}</h5>,
          h5: ({ children }) => <h6>{children}</h6>,
          h6: ({ children }) => <h6>{children}</h6>,
          a: ({ href, children }) => {
            const safeHref = safeMarkdownUrl(href);
            return safeHref
              ? <a href={safeHref} target="_blank" rel="noreferrer">{children}</a>
              : <span>{children}</span>;
          },
          img: ({ alt }) => alt ? <span>{alt}</span> : null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
