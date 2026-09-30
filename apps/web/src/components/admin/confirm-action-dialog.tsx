"use client";

import { useId } from "react";

type ConfirmActionDialogProps = {
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmActionDialog({ eyebrow, title, description, confirmLabel, onCancel, onConfirm }: ConfirmActionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div className="ops-modal-scrim" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onCancel()}>
      <section className="ops-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="ops-modal__head"><div><p className="admin-eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div></div>
        <p id={descriptionId}>{description}</p>
        <div className="ops-modal__actions">
          <button className="admin-secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="ops-danger-button" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
