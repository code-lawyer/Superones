"use client";

import { useEffect, useRef, useState } from "react";

export function OpcFeeNotePopover({
  id,
  note,
}: {
  id: string;
  note: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="opc-fee-note" data-open={open || undefined} ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? "关闭费用说明" : "查看费用说明"}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
      >
        ?
      </button>
      {open ? (
        <div className="opc-fee-note__popover" id={id} role="note">
          <strong>费用说明</strong>
          <p>{note}</p>
        </div>
      ) : null}
    </div>
  );
}
