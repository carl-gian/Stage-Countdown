import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

/** A read-only address with a Copy button. */
export default function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <code className="flex-1 min-w-0 truncate text-xs text-emerald-300 select-text">{url}</code>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-white/10 text-white hover:bg-white/20 shrink-0"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
