import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface Props {
  content: string;
  projectId: string;
}

export default function MarkdownViewer({ content, projectId }: Props) {
  // Strip YAML frontmatter before rendering
  let displayContent = content;
  if (displayContent.startsWith('---')) {
    const parts = displayContent.split('---');
    if (parts.length >= 3) {
      displayContent = parts.slice(2).join('---').trim();
    }
  }

  return (
    <div className="prose prose-sm prose-slate max-w-none
      prose-headings:font-semibold prose-headings:text-gray-800
      prose-p:text-gray-600 prose-p:leading-relaxed
      prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
      prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal
      prose-pre:bg-gray-900 prose-pre:rounded-lg prose-pre:text-gray-100
      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-100
      prose-blockquote:border-indigo-300 prose-blockquote:text-gray-600
      prose-table:text-sm
      prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2
      prose-td:px-3 prose-td:py-2
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          img: ({ src, alt }) => {
            let resolvedSrc = src || '';
            if (!resolvedSrc.startsWith('http') && !resolvedSrc.startsWith('/')) {
              resolvedSrc = resolvedSrc.replace(/^(\.\.\/)+/, '');
              resolvedSrc = `/files/${projectId}/${resolvedSrc}`;
            }
            return (
              <img src={resolvedSrc} alt={alt || ''} className="max-w-full h-auto my-4 rounded-lg border border-gray-200 shadow-sm" />
            );
          },
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}