function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  let html = escapeHtml(value);

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label: string, href: string) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`,
  );
  html = html.replace(
    /\[((?:SRC|WEB)_\d+)\]/g,
    (_, sourceId: string) =>
      `<button type="button" class="citation-token" data-source-id="${escapeHtml(
        sourceId,
      )}">[${escapeHtml(sourceId)}]</button>`,
  );
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html;
}

function renderMarkdownToHtml(markdown: string): string {
  const codeBlocks: string[] = [];
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const withPlaceholders = normalized.replace(
    /```([\w-]*)\n?([\s\S]*?)```/g,
    (_, language: string, code: string) => {
      const block = `<pre class="markdown-code-block"><code${
        language ? ` data-language="${escapeHtml(language)}"` : ""
      }>${escapeHtml(code.trimEnd())}</code></pre>`;
      const index = codeBlocks.push(block) - 1;
      return `@@CODE_BLOCK_${index}@@`;
    },
  );

  const lines = withPlaceholders.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const codeMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (codeMatch) {
      blocks.push(codeBlocks[Number(codeMatch[1])] || "");
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2].trim());
      blocks.push(`<h${level}>${content}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, "").trim());
        index += 1;
      }
      blocks.push(
        `<ul>${items
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join("")}</ul>`,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push(
        `<ol>${items
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join("")}</ol>`,
      );
      continue;
    }

    if (/^\s*>\s+/.test(line)) {
      const quotes: string[] = [];
      while (index < lines.length && /^\s*>\s+/.test(lines[index])) {
        quotes.push(lines[index].replace(/^\s*>\s+/, "").trim());
        index += 1;
      }
      blocks.push(
        `<blockquote>${quotes
          .map((item) => renderInlineMarkdown(item))
          .join("<br />")}</blockquote>`,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed) {
        break;
      }
      if (
        /^@@CODE_BLOCK_(\d+)@@$/.test(currentTrimmed) ||
        /^(#{1,3})\s+/.test(current) ||
        /^\s*[-*]\s+/.test(current) ||
        /^\s*\d+\.\s+/.test(current) ||
        /^\s*>\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }

    blocks.push(
      `<p>${paragraphLines
        .map((item) => renderInlineMarkdown(item))
        .join("<br />")}</p>`,
    );
  }

  return blocks.join("");
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onCitationClick?: (sourceId: string) => void;
}

export function MarkdownRenderer({
  content,
  className,
  onCitationClick,
}: MarkdownRendererProps) {
  const html = renderMarkdownToHtml(content);
  const resolvedClassName = ["markdown-content", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={resolvedClassName}
      onClick={(event) => {
        if (!onCitationClick || !(event.target instanceof HTMLElement)) {
          return;
        }

        const citationButton = event.target.closest(
          ".citation-token",
        ) as HTMLButtonElement | null;
        const sourceId = citationButton?.dataset.sourceId;

        if (!sourceId) {
          return;
        }

        event.preventDefault();
        onCitationClick(sourceId);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
