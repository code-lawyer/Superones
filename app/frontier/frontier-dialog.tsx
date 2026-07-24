"use client";

import { useId, useRef, type ReactNode } from "react";

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

  return (
    <>
      <button ref={triggerRef} className={triggerClassName} type="button" onClick={open}>{trigger}</button>
      <dialog className="frontier-dialog" ref={dialogRef} aria-labelledby={titleId} onClose={() => triggerRef.current?.focus()}>
        <div className="frontier-dialog__frame">
          <header className="frontier-dialog__header">
            <div><p className="eyebrow mono">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
            <button className="frontier-dialog__close mono" type="button" aria-label="关闭弹窗" onClick={close}>关闭</button>
          </header>
          <div className="frontier-dialog__body">{children}</div>
        </div>
      </dialog>
    </>
  );
}
