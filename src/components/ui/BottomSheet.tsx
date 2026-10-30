"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* No mobile é um bottom sheet de verdade (ancorado embaixo, largura
              cheia). A partir de sm, vira um modal centralizado na tela —
              antes ficava "meio preso" perto do rodapé no desktop, um
              resquício do padrão mobile que não fazia sentido com espaço de
              sobra em volta. */}
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full sm:max-w-md bg-white dark:bg-surface-darkcard rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-5 max-h-[85vh] overflow-y-auto shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <div className="sheet-handle sm:hidden" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">{title}</h2>
                <button onClick={onClose} className="btn-icon text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
                  ✕
                </button>
              </div>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
