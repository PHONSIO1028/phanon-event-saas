'use client';
import type { ReactNode } from 'react';

// Superposition plein écran utilisée pour l'aperçu PDF des devis et des
// contrats. L'impression navigateur ("Enregistrer en PDF") ne montre que
// le contenu marqué .print-area grâce aux règles @media print de style.css.
export default function PrintView({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <strong>{title}</strong>
        <div>
          <button onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
      <div className="print-area">{children}</div>
    </div>
  );
}
