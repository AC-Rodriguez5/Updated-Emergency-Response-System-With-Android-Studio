import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { modalVariants } from '@/styles/motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  return (
    // modal={false} on purpose. A modal Radix dialog disables pointer events
    // everywhere else on the page, which silently swallowed clicks on the
    // emergency toasts stacked above it — the one thing on screen that must
    // never be unreachable. Outside clicks still close it; see onInteractOutside.
    <Dialog.Root open={open} modal={false} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[#071526]/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            {/*
              Centering lives on this wrapper, not on the panel. The panel is a motion
              element whose variants animate scale/y, and Motion writes those as an
              inline `transform` — which silently wins over Tailwind's -translate-x-1/2
              -translate-y-1/2, leaving a left-1/2 top-1/2 panel hanging off-centre by
              half its own size. Flex centring keeps the two concerns apart.
            */}
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Content
                asChild
                forceMount
                onInteractOutside={(event) => {
                  // Acting on an alert is not "clicking away" from the dialog.
                  const target = event.target as HTMLElement | null;
                  if (target?.closest('[data-overlay-layer]')) event.preventDefault();
                }}
              >
                <motion.div
                  variants={modalVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={cn(
                    'pointer-events-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/60 bg-white p-5 shadow-command sm:p-6',
                    className,
                  )}
                >
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="ta-kicker">Operational detail</p>
                      <Dialog.Title className="mt-1 text-lg font-extrabold text-slate-950">{title}</Dialog.Title>
                    </div>
                    <Dialog.Close asChild>
                      <button type="button" onClick={onClose} aria-label="Close dialog" className="grid size-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                        <X className="size-5" />
                      </button>
                    </Dialog.Close>
                  </div>
                  {children}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
