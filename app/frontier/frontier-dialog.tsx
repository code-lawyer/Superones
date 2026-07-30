"use client";

import { useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";

export function FrontierDialog({ trigger, title, eyebrow, children, triggerClassName = "text-link" }: {
  trigger: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function cancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    close();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) close();
  }

  return (
    <>
      <button ref={triggerRef} className={triggerClassName} type="button" onClick={open}>{trigger}</button>
      <dialog
        className="frontier-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={cancel}
        onClick={closeFromBackdrop}
        onClose={() => triggerRef.current?.focus()}
      >
        <div className="frontier-dialog__frame">
          <header className="frontier-dialog__header">
            <div><p className="eyebrow mono">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
            <button className="frontier-dialog__close mono" type="button" aria-label={`关闭${title}`} onClick={close}>关闭</button>
          </header>
          <div className="frontier-dialog__body">{children}</div>
        </div>
      </dialog>
    </>
  );
}
