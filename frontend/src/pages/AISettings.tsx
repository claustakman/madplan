import { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Settings {
  ai_model_shopping: string;
  ai_model_recipe: string;
  ai_model_mealplan: string;
}

const MODELS = [
  { value: 'claude-haiku-4-20250514', label: 'Claude Haiku 4 (hurtig)' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (anbefalet)' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (kraftfuld)' },
  { value: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
  { value: 'claude-sonnet-3-5', label: 'Claude Sonnet 3.5' },
];

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: '16px',
    maxWidth: '600px',
    margin: '0 auto',
    paddingBottom: '100px',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  subheading: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '24px',
    lineHeight: 1.4,
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    display: 'block',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '16px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    appearance: 'none' as const,
    cursor: 'pointer',
  },
  desc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '6px',
  },
  saveBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '20px',
  },
  saveBtnDisabled: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: '#aaa',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'not-allowed',
    marginTop: '20px',
  },
  toast: {
    position: 'fixed' as const,
    bottom: '90px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#2e7d32',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 500,
    zIndex: 999,
    whiteSpace: 'nowrap' as const,
  },
  readonlyNotice: {
    background: '#fff3e0',
    border: '1px solid #ffb74d',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#e65100',
    marginBottom: '20px',
  },
};

export default function AISettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState<Settings>({
    ai_model_shopping: 'claude-haiku-4-20250514',
    ai_model_recipe: 'claude-sonnet-4-20250514',
    ai_model_mealplan: 'claude-sonnet-4-20250514',
  });
  const [original, setOriginal] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    apiGet<Settings>('/api/settings').then(data => {
      setSettings(data);
      setOriginal(data);
    }).catch(() => {});
  }, []);

  const isDirty = original && (
    settings.ai_model_shopping !== original.ai_model_shopping ||
    settings.ai_model_recipe !== original.ai_model_recipe ||
    settings.ai_model_mealplan !== original.ai_model_mealplan
  );

  async function handleSave() {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const data = await apiPut<Settings>('/api/settings', settings);
      setSettings(data);
      setOriginal(data);
      setToast('✓ Indstillinger gemt');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.page}>
      <h1 style={s.heading}>AI-indstillinger</h1>
      <p style={s.subheading}>
        Vælg hvilken Claude-model der bruges til de tre AI-funktioner.
        Hurtigere modeller er billigere men mindre præcise.
      </p>

      {!isAdmin && (
        <div style={s.readonlyNotice}>
          🔒 Kun administratorer kan ændre AI-indstillinger.
        </div>
      )}

      <div style={s.card}>
        <label style={s.label}>🎤 Indkøbsdiktering</label>
        <select
          style={s.select}
          value={settings.ai_model_shopping}
          onChange={e => setSettings(p => ({ ...p, ai_model_shopping: e.target.value }))}
          disabled={!isAdmin}
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <p style={s.desc}>Bruges til at fortolke diktering til indkøbslisten</p>
      </div>

      <div style={s.card}>
        <label style={s.label}>✨ AI-opskrift</label>
        <select
          style={s.select}
          value={settings.ai_model_recipe}
          onChange={e => setSettings(p => ({ ...p, ai_model_recipe: e.target.value }))}
          disabled={!isAdmin}
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <p style={s.desc}>Bruges til at generere opskrifter og forslag i opskriftskataloget</p>
      </div>

      <div style={s.card}>
        <label style={s.label}>🗓 AI-madplan</label>
        <select
          style={s.select}
          value={settings.ai_model_mealplan}
          onChange={e => setSettings(p => ({ ...p, ai_model_mealplan: e.target.value }))}
          disabled={!isAdmin}
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <p style={s.desc}>Bruges til at foreslå madplaner baseret på opskriftskataloget</p>
      </div>

      {isAdmin && (
        <button
          style={isDirty ? s.saveBtn : s.saveBtnDisabled}
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving ? 'Gemmer…' : 'Gem indstillinger'}
        </button>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
