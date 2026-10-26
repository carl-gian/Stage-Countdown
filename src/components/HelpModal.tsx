import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HELP_TOPICS, DOCK_URL } from '@/lib/help';
import CopyUrl from '@/components/CopyUrl';

interface HelpModalProps {
  open: boolean;
  /** Topic id to show when opened. */
  topic: string;
  onClose: () => void;
}

/** The in-app guide: a topic list on the left, the chosen topic on the right (stacked on a narrow window). */
export default function HelpModal({ open, topic, onClose }: HelpModalProps) {
  const [current, setCurrent] = useState(topic);

  useEffect(() => {
    if (open) setCurrent(HELP_TOPICS.some((t) => t.id === topic) ? topic : HELP_TOPICS[0].id);
  }, [open, topic]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const active = HELP_TOPICS.find((t) => t.id === current) ?? HELP_TOPICS[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
          role="dialog"
          aria-label="Help"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full max-w-lg max-h-[92%] mx-3 rounded-2xl border border-white/10 bg-[#12121a] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#12121a]">
              <h2 className="text-base font-bold text-white">Help</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" aria-label="Close help">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-white/5">
              {HELP_TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setCurrent(t.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    t.id === active.id ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">{active.title}</h3>
                <p className="text-xs text-gray-500">{active.summary}</p>
              </div>
              {active.sections.map((s, i) => (
                <div key={i} className="space-y-2">
                  {s.heading && <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{s.heading}</h4>}
                  {s.paragraphs?.map((p, j) => (
                    <p key={j} className="text-[13px] leading-relaxed text-gray-300">{p}</p>
                  ))}
                  {s.steps && (
                    <ol className="space-y-2">
                      {s.steps.map((step, j) => (
                        <li key={j} className="flex gap-2.5 text-[13px] leading-relaxed text-gray-200">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-[#06231d]">
                            {j + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {s.tip && (
                    <p className="rounded-lg bg-blue-500/10 border border-blue-400/20 px-3 py-2 text-xs leading-relaxed text-blue-200">
                      <b>Tip:</b> {s.tip}
                    </p>
                  )}
                  {active.id === 'dock' && s.heading?.startsWith('Add the dock') && <CopyUrl url={DOCK_URL} />}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
