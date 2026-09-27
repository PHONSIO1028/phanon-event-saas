import type { Row } from './types';
import { money } from './types';

export type ContractData = {
  template: string;
  profile: Row | null;
  client: Row | undefined | null;
  event: Row;
};

function header(profile: Row | null): string {
  const name = profile?.business_name || profile?.full_name || 'Le prestataire';
  const phone = profile?.phone || '—';
  const address = profile?.address || '—';
  return `${name}\nTéléphone : ${phone}\nAdresse : ${address}`;
}

function commonClauses(): string[] {
  return [
    "Le prestataire s'engage à réaliser la prestation convenue avec le matériel et le savoir-faire nécessaires.",
    "Un acompte est requis pour confirmer la réservation de la date ; le solde est dû au plus tard le jour de la prestation, sauf accord écrit contraire.",
    "En cas d'annulation par le client à moins de 15 jours de l'événement, l'acompte versé reste acquis au prestataire.",
    "Les livrables (photos, vidéos, albums) sont remis dans le délai indiqué sur le devis, après validation du solde.",
    "Le prestataire peut utiliser des extraits du travail réalisé à des fins de communication, sauf refus écrit du client.",
  ];
}

export function buildContractText(data: ContractData): string {
  const { profile, client, event } = data;
  const clientName = client?.name || 'Client';
  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const amount = money(Number(event.amount || 0));
  const location = event.location || '—';

  const titleByTemplate: Record<string, string> = {
    mariage: 'CONTRAT DE PRESTATION — MARIAGE',
    anniversaire: 'CONTRAT DE PRESTATION — ANNIVERSAIRE',
    general: 'CONTRAT DE PRESTATION PHOTO / VIDÉO',
  };
  const title = titleByTemplate[data.template] || titleByTemplate.general;

  const lines = [
    title,
    '',
    header(profile),
    '',
    `Entre le prestataire ci-dessus et ${clientName} ("le client"), il est convenu ce qui suit :`,
    '',
    `Événement : ${event.name}`,
    `Date : ${eventDate}`,
    `Lieu : ${location}`,
    `Montant total de la prestation : ${amount}`,
    '',
    'Conditions générales :',
    ...commonClauses().map((c, i) => `${i + 1}. ${c}`),
    '',
    'Fait en deux exemplaires, à Abidjan.',
    '',
    'Signature du prestataire' + '\t'.repeat(4) + 'Signature du client',
  ];
  return lines.join('\n');
}
