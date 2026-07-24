import { memo, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";

const SHOW_AFTER_PX = 600;

function BackToTopButtonInner({
  /** Extra offset above bottom nav / floating dock */
  bottomClassName = "bottom-[calc(10.5rem+env(safe-area-inset-bottom,0px))] md:bottom-8",
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;

    const update = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setVisible(y > SHOW_AFTER_PX);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          key="back-to-top"
          initial={{ opacity: 0, scale: 0.85, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={handleClick}
          aria-label="Back to top"
          className={`fixed right-4 z-[60] ${bottomClassName} flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/90 text-gray-800 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-md transition-colors hover:bg-white active:scale-95 dark:border-white/10 dark:bg-[#1a1a1a]/90 dark:text-white md:right-6`}
          style={{
            boxShadow:
              "0 8px 24px rgba(0,0,0,0.14), 0 0 0 1px rgba(var(--module-theme-rgb,250,2,114),0.08)",
          }}
        >
          <ChevronUp className="h-5 w-5" strokeWidth={2.25} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

const BackToTopButton = memo(BackToTopButtonInner);
export default BackToTopButton;
