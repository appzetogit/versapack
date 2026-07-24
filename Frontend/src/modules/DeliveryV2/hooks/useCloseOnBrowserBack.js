import { useEffect, useRef } from "react";

/**
 * When modal/sheet/viewer is open, pressing browser back closes it first.
 */
export default function useCloseOnBrowserBack(isOpen, onClose, modalKey = "modal") {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const state = window.history.state || {};
    window.history.pushState({ ...state, __deliveryModal: modalKey }, "");

    const handlePopState = () => {
      onCloseRef.current?.();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen, modalKey]);
}

