import { useEffect, useState } from 'react';

type Health = {
  status: string;
  time?: string;
};

type Dashboard = {
  total_live_birds: number;
  active_batches: number;
  today_deaths: number;
  today_lost: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const mockActivity = [
  'Batch June-01: 4 deaths entered',
  'Feed Starter: 25 kg used',
  'Sale: 120 birds sold',
  'Medicine: Vitamin mix added',
  'Photo uploaded for Shed A',
];

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const healthRes = await fetch(`${API_BASE}/health`);
        setHealth(await healthRes.json());

        const dashRes = await fetch(`${API_BASE}/api/reports/dashboard`);
        setDashboard(await dashRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load API');
      }
    }

    load();
  }, []);

  const stats = [
    { title: 'Live Birds', value: dashboard?.total_live_birds || 982, tone: 'green' },
    { title: 'Active Batches', value: dashboard?.active_batches || 3, tone: 'purple' },
    { title: 'Today Deaths', value: dashboard?.today_deaths || 4, tone: 'orange' },
    { title: 'Today Lost', value: dashboard?.today_lost || 1, tone: 'rose' },
    { title: 'Feed Stock', value: '128 kg', tone: 'yellow' },
    { title: 'Medicine Alerts', value: 2, tone: 'teal' },
    { title: 'Pending Sales', value: '₹18,400', tone: 'sky' },
    { title: 'Mortality', value: '1.8%', tone: 'cream' },
  ];

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Poultry inventory workspace</p>
          <h1>Farm inventory, losses, sales, and reports in one calm workspace.</h1>
          <p className="subtitle">
            Inventopedia helps poultry farms track chicks, deaths, lost birds, feed, medicine, sales, bills, and daily reports without messy notebooks.
          </p>
          <div className="hero-actions">
            <button className="btn primary">Start with my farm</button>
            <button className="btn secondary-dark">View demo</button>
          </div>
        </div>
        <div className="mockup-card">
          <div className="mockup-topbar">
            <span className="dot purple" />
            <span className="dot green" />
            <span className="dot yellow" />
            <strong>Srimat Farm HQ</strong>
          </div>
          <div className="mockup-grid">
            {stats.slice(0, 4).map((item) => (
              <MetricCard key={item.title} {...item} />
            ))}
          </div>
          <div className="activity-card">
            <div className="card-title-row">
              <h3>Recent activity</h3>
              <span className="badge">Today</span>
            </div>
            {mockActivity.map((item) => (
              <div className="activity-row" key={item}>
                <span className="check-dot" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-header">
        <div>
          <p className="eyebrow dark">Dashboard preview</p>
          <h2>Every important farm signal, visible fast.</h2>
        </div>
        <div className="api-status">
          <span>API</span>
          <strong>{health?.status || 'mock'}</strong>
          {error && <small>{error}</small>}
        </div>
      </section>

      <section className="metric-grid">
        {stats.map((item) => (
          <MetricCard key={item.title} {...item} />
        ))}
      </section>

      <section className="feature-grid">
        <FeatureCard tone="peach" title="Track every batch" text="Follow opening chicks, current live count, deaths, losses, and sales from a single batch timeline." />
        <FeatureCard tone="mint" title="Daily entry in under one minute" text="Worker-friendly mobile forms for dead count, lost count, feed usage, medicine notes, and photos." />
        <FeatureCard tone="lavender" title="Reports that owners trust" text="Export mortality, sales, feed, medicine, and staff activity reports without rebuilding Excel sheets." />
      </section>
    </main>
  );
}

function MetricCard({ title, value, tone }: { title: string; value: number | string; tone: string }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FeatureCard({ title, text, tone }: { title: string; text: string; tone: string }) {
  return (
    <article className={`feature-card ${tone}`}>
      <span className="mini-icon" />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
