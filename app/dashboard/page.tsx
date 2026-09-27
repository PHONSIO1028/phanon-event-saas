import { redirect } from 'next/navigation';
import { userDB } from '../../lib/server';
import ClientDashboard from './ui';

export default async function Dashboard() {
  const db = await userDB();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/auth');

  const [
    { data: clients },
    { data: events },
    { data: payments },
    { data: quotes },
    { data: contracts },
    { data: deliveries },
    { data: profile },
    { data: subscription },
  ] = await Promise.all([
    db.from('clients').select('*').order('created_at', { ascending: false }),
    db.from('events').select('*').order('date'),
    db.from('event_payments').select('*'),
    db.from('quotes').select('*').order('created_at', { ascending: false }),
    db.from('contracts').select('*').order('created_at', { ascending: false }),
    db.from('deliveries').select('*').order('created_at', { ascending: false }),
    db.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  return (
    <ClientDashboard
      email={user.email || ''}
      clients={clients || []}
      events={events || []}
      payments={payments || []}
      quotes={quotes || []}
      contracts={contracts || []}
      deliveries={deliveries || []}
      profile={profile || null}
      plan={subscription?.plan || 'free'}
    />
  );
}
