import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { CHANGELOG, entriesSince, type ChangelogEntry } from '@/lib/changelog';

interface WhatsNewModalProps {
  open: boolean;
  /** Version we are running now. */
  version: string;
  /** Version last acknowledged on this PC ('' = never). Only newer notes are listed; omit to list everything. */
  from?: string;
  onClose: () => void;
}

export default function WhatsNewModal({ open, version, from, onClose }: WhatsNewModalProps) {
  const entries: ChangelogEntry[] = from ? entriesSince(from, version) : CHANGELOG;
  const shown = entries.length ? entries : CHANGELOG.slice(0, 1);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] flex items-center justify-center"
          role="dialog"
          aria-label="What's new"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            className="relative flex flex-col w-full max-w-md max-h-[88%] mx-4 rounded-2xl border border-white/10 bg-[#12121a] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
              <Sparkles size={18} className="text-emerald-400" />
              <h2 className="text-base font-bold text-white">What's new in Stage Countdown {version}</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {shown.map((e) => (
                <div key={e.version}>
                  <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Version {e.version} · {e.date}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {e.items.map((it, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-gray-200">
                        <span className="text-emerald-400">•</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-[#06231d] hover:bg-emerald-400">
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
