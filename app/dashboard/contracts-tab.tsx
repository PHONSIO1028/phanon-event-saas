'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { QuoteItem, Row } from './types';
import { contractStatusLabels, contractTemplateLabels, quoteTotal } from './types';
import { buildContract } from './contract-templates';
import PrintView from './print-view';

export default function ContractsTab({
  clients,
  events,
  contracts,
  quotes,
  profile,
  accountEmail,
  focusEventId,
  setMsg,
}: {
  clients: Row[];
  events: Row[];
  contracts: Row[];
  quotes?: Row[];
  profile: Row | null;
  accountEmail?: string;
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const [eventId, setEventId] = useState(focusEventId || events[0]?.id || '');
  const [template, setTemplate] = useState('general');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const router = useRouter();
  const db = browserDB();

  async function createContract() {
    setMsg('');
    if (!eventId) {
      setMsg('Choisissez un événement.');
      return;
    }
    const { error } = await db.from('contracts').insert({ event_id: eventId, template, status: 'brouillon' });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function setStatus(id: string, status: string) {
    setMsg('');
    const { error } = await db.from('contracts').update({ status }).eq('id', id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  function eventName(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return '—';
    const client = clients.find((c) => c.id === ev.client_id);
    return `${ev.name} — ${client?.name || ''}`;
  }

  // Numéro automatique : CTR-2026-001, CTR-2026-002... (par année, selon la date de création)
  function contractNumber(c: Row) {
    const year = new Date(c.created_at).getFullYear();
    const sameYear = contracts
      .filter((x) => new Date(x.created_at).getFullYear() === year)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const rank = sameYear.findIndex((x) => x.id === c.id) + 1;
    return `CTR-${year}-${String(rank).padStart(3, '0')}`;
  }

  // Montant du contrat : devis accepté de l'événement, sinon dernier devis, sinon montant de l'événement
  function contractAmount(evId: string, fallback: number) {
    const list = (quotes || []).filter((q) => q.event_id === evId);
    const chosen = list.find((q) => q.status === 'accepte') || list[0];
    if (!chosen) return fallback;
    return quoteTotal((chosen.items || []) as QuoteItem[]);
  }

  const previewContract = contracts.find((c) => c.id === previewId);
  const previewEvent = previewContract ? events.find((e) => e.id === previewContract.event_id) : null;
  const previewClient = previewEvent ? clients.find((c) => c.id === previewEvent.client_id) : null;
  const doc =
    previewContract && previewEvent
      ? buildContract({
          template: previewContract.template,
          profile,
          client: previewClient,
          event: previewEvent,
          total: contractAmount(previewEvent.id, Number(previewEvent.amount || 0)),
          email: accountEmail,
          issuedAt: previewContract.created_at,
        })
      : null;

  return (
    <section>
      <h2>Contrats</h2>

      <div className="quote-form">
        <label>
          Événement
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="" disabled>
              Choisir un événement
            </option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {eventName(e.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modèle
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {Object.entries(contractTemplateLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={createContract}>Générer le contrat</button>
      </div>

      <table>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id}>
              <td>{contractNumber(c)}</td>
              <td>{eventName(c.event_id)}</td>
              <td>{contractTemplateLabels[c.template] || c.template}</td>
              <td>{contractStatusLabels[c.status] || c.status}</td>
              <td>
                <button onClick={() => setPreviewId(c.id)}>Aperçu PDF</button>
                {c.status === 'brouillon' && <button onClick={() => setStatus(c.id, 'envoye')}>Marquer envoyé</button>}
                {c.status === 'envoye' && <button onClick={() => setStatus(c.id, 'signe')}>Marquer signé</button>}
              </td>
            </tr>
          ))}
          {contracts.length === 0 && (
            <tr>
              <td className="muted">Aucun contrat pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      {previewContract && previewEvent && doc && (
        <PrintView title={`Contrat — ${previewEvent.name}`} onClose={() => setPreviewId(null)}>
          <h1>{doc.providerName}</h1>
          <p className="muted">
            {doc.phone && <>Tél : {doc.phone}<br /></>}
            {doc.email && <>E-mail : {doc.email}<br /></>}
            {doc.address && <>{doc.address}</>}
          </p>

          <h2>{doc.title}</h2>
          <p className="muted">
            Contrat n° {contractNumber(previewContract)} · Établi le {doc.issuedOn}
          </p>

          <p>
            <strong>Entre :</strong> {doc.providerName}, ci-après « le prestataire »,
            <br />
            <strong>Et :</strong> {doc.clientName}, ci-après « le client ».
          </p>
          <p>Il est convenu ce qui suit :</p>

          {doc.articles.map((a, i) => (
            <div key={i}>
              <h3>
                Article {i + 1} — {a.title}
              </h3>
              <p style={{ whiteSpace: 'pre-line' }}>{a.text}</p>
            </div>
          ))}

          <p style={{ marginTop: '20px' }}>Fait en deux exemplaires, à Abidjan, le {doc.issuedOn}.</p>

          <h3>Lu et approuvé</h3>
          <div style={{ display: 'flex', gap: '48px', marginTop: '16px' }}>
            <div style={{ flex: 1 }}>
              <p>Le prestataire (date et signature)</p>
              <div style={{ borderBottom: '1px solid #000', height: '70px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p>Le client (nom, date et signature)</p>
              <div style={{ borderBottom: '1px solid #000', height: '70px' }} />
            </div>
          </div>

          <p className="muted" style={{ marginTop: '24px' }}>
            Contrat généré via PH@NON EVENT — Organisez. Produisez. Encaissez. Livrez.
          </p>
        </PrintView>
      )}
    </section>
  );
}
