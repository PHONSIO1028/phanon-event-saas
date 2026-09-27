'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';
import { contractStatusLabels, contractTemplateLabels } from './types';
import { buildContractText } from './contract-templates';
import PrintView from './print-view';

export default function ContractsTab({
  clients,
  events,
  contracts,
  profile,
  focusEventId,
  setMsg,
}: {
  clients: Row[];
  events: Row[];
  contracts: Row[];
  profile: Row | null;
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

  const previewContract = contracts.find((c) => c.id === previewId);
  const previewEvent = previewContract ? events.find((e) => e.id === previewContract.event_id) : null;
  const previewClient = previewEvent ? clients.find((c) => c.id === previewEvent.client_id) : null;
  const contractText =
    previewContract && previewEvent
      ? buildContractText({ template: previewContract.template, profile, client: previewClient, event: previewEvent })
      : '';

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

      {previewContract && previewEvent && (
        <PrintView title={`Contrat — ${previewEvent.name}`} onClose={() => setPreviewId(null)}>
          <pre className="contract-text">{contractText}</pre>
        </PrintView>
      )}
    </section>
  );
}
