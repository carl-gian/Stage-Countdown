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

/** The in-app guide: topic buttons along the top, the chosen topic below. */
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
          transition={{ duration: 0.15 }}
          className="sc-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Help"
        >
          <div className="sc-dialog__veil" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
            className="sc-dialog__panel sc-dialog__panel--wide"
          >
            <div className="sc-dialog__head">
              <h2>Help</h2>
              <button className="st-btn st-btn--icon" onClick={onClose} aria-label="Close help">
                <X />
              </button>
            </div>

            <div className="sc-topics" role="group" aria-label="Help topics">
              {HELP_TOPICS.map((t) => (
                <button key={t.id} type="button" aria-pressed={t.id === active.id} onClick={() => setCurrent(t.id)}>
                  {t.title}
                </button>
              ))}
            </div>

            <div className="sc-dialog__body sc-help">
              <h3>{active.title}</h3>
              <p style={{ color: 'var(--text-dim)' }}>{active.summary}</p>
              {active.sections.map((s, i) => (
                <div key={i}>
                  {s.heading && <h4>{s.heading}</h4>}
                  {s.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
                  {s.steps && (
                    <ol>
                      {s.steps.map((step, j) => (
                        <li key={j}>
                          <b>{j + 1}</b>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {s.tip && (
                    <div className="st-banner" role="note">
                      <svg className="st-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
                      </svg>
                      <div className="st-banner__body">
                        <p style={{ margin: 0, color: 'var(--text)' }}><b style={{ display: 'inline', fontSize: 'inherit' }}>Tip:</b> {s.tip}</p>
                      </div>
                    </div>
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
