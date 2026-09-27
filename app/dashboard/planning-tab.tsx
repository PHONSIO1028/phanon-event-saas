'use client';
import { useMemo, useState } from 'react';
import type { Row } from './types';
import { money } from './types';

const monthNames = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function PlanningTab({ clients, events }: { clients: Row[]; events: Row[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const eventsByDay = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const e of events) {
      const d = new Date(e.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = String(d.getDate());
        map[key] = map[key] || [];
        map[key].push(e);
      }
    }
    return map;
  }, [events, year, month]);

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || '—';
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  }

  const monthEvents = Object.values(eventsByDay).flat().sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section>
      <h2>Planning / Calendrier</h2>
      <div className="calendar-nav">
        <button onClick={prevMonth}>◀</button>
        <strong>{monthNames[month]} {year}</strong>
        <button onClick={nextMonth}>▶</button>
      </div>
      <div className="calendar-grid">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="calendar-head">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className={'calendar-cell' + (day && eventsByDay[String(day)] ? ' has-event' : '')}>
            {day && <span>{day}</span>}
            {day && eventsByDay[String(day)]?.map((e) => <div key={e.id} className="calendar-event">{e.name}</div>)}
          </div>
        ))}
      </div>

      <h3>Événements du mois</h3>
      <table>
        <tbody>
          {monthEvents.map((e) => (
            <tr key={e.id}>
              <td>{e.date}</td>
              <td>{e.name}</td>
              <td>{clientName(e.client_id)}</td>
              <td>{e.location}</td>
              <td>{money(Number(e.amount))}</td>
            </tr>
          ))}
          {monthEvents.length === 0 && (
            <tr>
              <td className="muted">Aucun événement ce mois-ci.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
