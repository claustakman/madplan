import React, { useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiPut } from '../lib/api';

export default function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await apiPut(`/api/users/${user!.id}`, { name, ...(password ? { password } : {}) });
      setSaved(true);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fejl');
    }
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 480 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Profil</h1>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Navn</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Nyt kodeord (valgfrit)</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Lad stå blank for at beholde"
            style={inputStyle}
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
        {saved && <p style={{ color: 'var(--accent)', fontSize: 14 }}>Gemt!</p>}

        <button type="submit" style={btnStyle}>Gem ændringer</button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  fontSize: 16,
  minHeight: 44,
};

const btnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  borderRadius: 8,
  padding: '14px',
  fontWeight: 600,
  fontSize: 16,
  minHeight: 44,
};
