import { useState, useCallback } from "react";

/**
 * Hook to manage open/close toggle behavior (e.g., for modals, drawers, menus).
 *
 * @param initialState - Optional initial state (default: false)
 * @returns Object with isOpen state and open, close, toggle handlers
 */
export function useDisclosure(initialState: boolean = false) {
  const [isOpen, setIsOpen] = useState<boolean>(initialState);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
