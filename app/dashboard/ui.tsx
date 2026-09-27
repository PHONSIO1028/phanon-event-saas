'use client';
import { useState } from 'react';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';
import { money } from './types';
import ClientsTab from './clients-tab';
import EventsTab from './events-tab';
import QuotesTab from './quotes-tab';
import PaymentsTab from './payments-tab';
import ContractsTab from './contracts-tab';
import DeliveryTab from './delivery-tab';
import PlanningTab from './planning-tab';
import SettingsTab from './settings-tab';

const prices: Record<string, number> = { starter: 5000, pro: 10000, studio: 20000 };

const tabs: [string, string][] = [
  ['overview', 'Tableau de bord'],
  ['clients', 'Clients'],
  ['events', 'Événements'],
  ['quotes', 'Devis'],
  ['payments', 'Paiements'],
  ['planning', 'Planning'],
  ['contracts', 'Contrats'],
  ['delivery', 'Livraison'],
  ['settings', 'Paramètres'],
  ['plans', 'Abonnements'],
];

export default function ClientDashboard({
  email,
  clients,
  events,
  payments,
  quotes,
  contracts,
  deliveries,
  profile,
  plan,
}: {
  email: string;
  clients: Row[];
  events: Row[];
  payments: Row[];
  quotes: Row[];
  contracts: Row[];
  deliveries: Row[];
  profile: Row | null;
  plan: string;
}) {
  const [tab, setTab] = useState('overview');
  const [msg, setMsg] = useState('');
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const db = browserDB();

  function goTo(nextTab: string, eventId: string) {
    setFocusEventId(eventId);
    setTab(nextTab);
  }

  async function checkout(next: string) {
    setMsg('Création du paiement…');
    const r = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: next }),
    });
    const data = await r.json();
    if (r.ok && data.url && new URL(data.url).hostname === 'checkout.cinetpay.com') location.href = data.url;
    else setMsg(data.error || 'Paiement indisponible');
  }

  const total = events.reduce((s, e) => s + Number(e.amount), 0);
  const received = payments.reduce((s, p) => s + Number(p.amount), 0);
  const upcoming = [...events]
    .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <>
      <header>
        <h1>PH@NON EVENT</h1>
        <p>
          {email} · Formule : {plan}
        </p>
        <nav>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if (id !== 'events') setFocusEventId(null);
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={async () => {
              await db.auth.signOut();
              location.href = '/auth';
            }}
          >
            Déconnexion
          </button>
        </nav>
      </header>
      <main>
        {msg && <p className="error">{msg}</p>}

        {tab === 'overview' && (
          <>
            <h2>Tableau de bord</h2>
            <div className="grid">
              <section>
                <h3>Clients</h3>
                <h1>{clients.length}</h1>
              </section>
              <section>
                <h3>Événements</h3>
                <h1>{events.length}</h1>
              </section>
              <section>
                <h3>CA prévu</h3>
                <h1>{money(total)}</h1>
              </section>
              <section>
                <h3>À encaisser</h3>
                <h1>{money(total - received)}</h1>
              </section>
            </div>
            <section>
              <h3>Prochains événements</h3>
              <table>
                <tbody>
                  {upcoming.map((e) => (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td>{e.name}</td>
                      <td>{money(Number(e.amount))}</td>
                    </tr>
                  ))}
                  {upcoming.length === 0 && (
                    <tr>
                      <td className="muted">Aucun événement à venir.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {tab === 'clients' && <ClientsTab clients={clients} setMsg={setMsg} />}

        {tab === 'events' && (
          <EventsTab
            clients={clients}
            events={events}
            quotes={quotes}
            contracts={contracts}
            deliveries={deliveries}
            payments={payments}
            setMsg={setMsg}
            goTo={goTo}
          />
        )}

        {tab === 'quotes' && (
          <QuotesTab clients={clients} events={events} quotes={quotes} profile={profile} focusEventId={focusEventId} setMsg={setMsg} />
        )}

        {tab === 'payments' && (
          <PaymentsTab events={events} payments={payments} focusEventId={focusEventId} setMsg={setMsg} />
        )}

        {tab === 'planning' && <PlanningTab clients={clients} events={events} />}

        {tab === 'contracts' && (
          <ContractsTab
            clients={clients}
            events={events}
            contracts={contracts}
            profile={profile}
            focusEventId={focusEventId}
            setMsg={setMsg}
          />
        )}

        {tab === 'delivery' && (
          <DeliveryTab clients={clients} events={events} deliveries={deliveries} focusEventId={focusEventId} setMsg={setMsg} />
        )}

        {tab === 'settings' && <SettingsTab profile={profile} setMsg={setMsg} />}

        {tab === 'plans' && (
          <>
            <h2>Abonnements</h2>
            <p>Le paiement active la formule pour 30 jours après confirmation par CinetPay.</p>
            <div className="grid">
              {Object.entries(prices).map(([name, amount]) => (
                <section key={name}>
                  <h2>{name}</h2>
                  <h1>{money(amount)}</h1>
                  <button onClick={() => checkout(name)}>Payer 30 jours</button>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
