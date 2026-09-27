export type Row = { id: string; [key: string]: any };

export type QuoteItem = { label: string; amount: number };

export function quoteTotal(items: QuoteItem[]): number {
  return items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
}

export const eventStatuses = ['prospect', 'devis_envoye', 'confirme', 'termine', 'annule'] as const;

export const statusLabels: Record<string, string> = {
  prospect: 'Prospect',
  devis_envoye: 'Devis envoyé',
  confirme: 'Confirmé',
  termine: 'Terminé',
  annule: 'Annulé',
};

export const quoteStatusLabels: Record<string, string> = {
  brouillon: 'Brouillon',
  envoye: 'Devis envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
};

export const contractStatusLabels: Record<string, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  signe: 'Signé',
};

export const contractTemplateLabels: Record<string, string> = {
  mariage: 'Mariage',
  anniversaire: 'Anniversaire',
  general: 'Prestation générale',
};

export function money(n: number): string {
  return Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
}
