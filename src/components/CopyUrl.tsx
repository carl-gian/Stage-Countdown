import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

/** A read-only address with a Copy button. */
export default function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2" style={{ padding: '4px 4px 4px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--page)', boxShadow: '0 0 0 1.5px var(--line)' }}>
      <code className="flex-1 min-w-0 truncate select-text sc-kbd" style={{ fontSize: 13, color: 'var(--brand-strong)' }}>{url}</code>
      <button
        type="button"
        className="st-btn st-btn--soft"
        style={{ minHeight: 36 }}
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
