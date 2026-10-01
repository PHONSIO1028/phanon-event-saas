import type { Row } from './types';
import { money } from './types';

// Échéancier de paiement (devis et contrat) : modifier ici pour changer partout
export const PAYMENT_PLAN: { percent: number; when: string }[] = [
  { percent: 50, when: 'à la signature du contrat' },
  { percent: 25, when: 'le jour de la cérémonie' },
  { percent: 25, when: 'à la livraison des fichiers' },
];

// Montants de chaque échéance (la dernière absorbe l'arrondi pour que la somme soit exacte)
export function paymentSchedule(total: number): { percent: number; when: string; amount: number }[] {
  let paid = 0;
  return PAYMENT_PLAN.map((p, i) => {
    const amount = i === PAYMENT_PLAN.length - 1 ? total - paid : Math.round((total * p.percent) / 100);
    paid += amount;
    return { ...p, amount };
  });
}

// Date lisible : 2026-12-12 -> 12 décembre 2026
export function frDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Texte tout en majuscules -> Première Lettre Majuscule (sinon inchangé)
export function tidy(value?: string | null): string {
  if (!value) return '—';
  const hasLetters = /[a-zA-ZÀ-ÿ]/.test(value);
  if (hasLetters && value === value.toUpperCase()) {
    return value
      .toLowerCase()
      .replace(/(^|[\s\-'’])([a-zà-ÿ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  }
  return value;
}

export type ContractData = {
  template: string;
  profile: Row | null;
  client: Row | undefined;
  event: Row;
  total?: number; // montant du devis (sinon montant de l'événement)
  email?: string; // e-mail de secours (compte)
  issuedAt?: string; // date d'établissement du contrat
};

export type ContractArticle = { title: string; text: string };

export type ContractDoc = {
  title: string;
  providerName: string;
  phone: string;
  email: string;
  address: string;
  clientName: string;
  eventName: string;
  eventDate: string;
  location: string;
  total: number;
  issuedOn: string;
  articles: ContractArticle[];
};

const titleByTemplate: Record<string, string> = {
  mariage: 'CONTRAT DE PRESTATION — MARIAGE',
  anniversaire: 'CONTRAT DE PRESTATION — ANNIVERSAIRE',
  general: 'CONTRAT DE PRESTATION PHOTO / VIDÉO',
};

export function buildContract(data: ContractData): ContractDoc {
  const { profile, client, event } = data;
  const total = Number(data.total ?? event.amount ?? 0);
  const eventDate = frDate(event.date);
  const location = tidy(event.location);
  const clientName = client?.name || 'Client';

  const objectByTemplate: Record<string, string> = {
    mariage: `Le prestataire réalise, pour le compte du client, la prestation photo / vidéo du mariage « ${event.name} ».`,
    anniversaire: `Le prestataire réalise, pour le compte du client, la prestation photo / vidéo de l'anniversaire « ${event.name} ».`,
    general: `Le prestataire réalise, pour le compte du client, la prestation photo / vidéo « ${event.name} ».`,
  };

  const articles: ContractArticle[] = [
    { title: 'Objet', text: objectByTemplate[data.template] || objectByTemplate.general },
    { title: 'Date et lieu', text: `Date : ${eventDate}\nLieu : ${location}` },
    {
      title: 'Prix et paiement',
      text:
        `Le montant total de la prestation est de ${money(total)}, payable en trois versements :\n` +
        paymentSchedule(total)
          .map((p) => `• ${p.percent} % (${money(p.amount)}) ${p.when}`)
          .join('\n') +
        `\nLe premier versement confirme la réservation de la date.`,
    },
    {
      title: 'Engagements du prestataire',
      text: "Le prestataire s'engage à réaliser la prestation convenue avec le matériel et le savoir-faire nécessaires.",
    },
    {
      title: 'Annulation',
      text: "En cas d'annulation par le client à moins de 15 jours de l'événement, l'acompte versé reste acquis au prestataire.",
    },
    {
      title: 'Livrables',
      text: 'Les livrables (photos, vidéos, albums) sont remis dans le délai indiqué sur le devis, contre le règlement du dernier versement.',
    },
    {
      title: 'Droit d’utilisation',
      text: 'Le prestataire peut utiliser des extraits du travail réalisé à des fins de communication, sauf refus écrit du client.',
    },
  ];

  return {
    title: titleByTemplate[data.template] || titleByTemplate.general,
    providerName: profile?.business_name || profile?.full_name || 'Le prestataire',
    phone: profile?.phone || '',
    email: profile?.email || data.email || '',
    address: profile?.address ? tidy(profile.address) : '',
    clientName,
    eventName: event.name,
    eventDate,
    location,
    total,
    issuedOn: frDate(data.issuedAt || new Date().toISOString()),
    articles,
  };
}

// Version texte brut (conservée pour compatibilité avec le reste de l'application)
export function buildContractText(data: ContractData): string {
  const d = buildContract(data);
  const contact = [
    d.phone && `Téléphone : ${d.phone}`,
    d.email && `E-mail : ${d.email}`,
    d.address && `Adresse : ${d.address}`,
  ].filter(Boolean);
  const lines = [
    d.title,
    '',
    d.providerName,
    ...contact,
    '',
    `Entre le prestataire ci-dessus et ${d.clientName} ("le client"), il est convenu ce qui suit :`,
    '',
    ...d.articles.flatMap((a, i) => [`Article ${i + 1} — ${a.title}`, a.text, '']),
    `Fait en deux exemplaires, à Abidjan, le ${d.issuedOn}.`,
    '',
    'Signature du prestataire' + '\t'.repeat(4) + 'Signature du client',
  ];
  return lines.join('\n');
}
