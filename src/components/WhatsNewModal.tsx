import { motion, AnimatePresence } from 'framer-motion';
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
          transition={{ duration: 0.15 }}
          className="sc-dialog"
          style={{ zIndex: 60 }}
          role="dialog"
          aria-modal="true"
          aria-label="What's new"
        >
          <div className="sc-dialog__veil" />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
            className="sc-dialog__panel"
          >
            <div className="sc-dialog__head" style={{ paddingRight: 20 }}>
              <h2>What's new in Stage Countdown {version}</h2>
            </div>
            <div className="sc-dialog__body sc-help">
              {shown.map((e) => (
                <div key={e.version}>
                  <h4 style={{ marginTop: 0 }}>Version {e.version} · {e.date}</h4>
                  <ul>
                    {e.items.map((it, i) => (
                      <li key={i}>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="sc-dialog__foot">
              <button className="st-btn st-btn--primary" onClick={onClose}>
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
