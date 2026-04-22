import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

// ─── CreateModal ──────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (user: User, password: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setSaving(true);
    setError('');
    try {
      const user = await apiPost<User>('/api/users', { name: name.trim(), email: email.trim(), password, role });
      onCreated(user, password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl ved oprettelse');
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Ny bruger</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modalBody}>
          <label style={s.label}>Navn *</label>
          <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Fulde navn" autoFocus />

          <label style={s.label}>Email *</label>
          <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="bruger@eksempel.dk" />

          <label style={s.label}>Kodeord *</label>
          <input style={s.input} type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Midlertidigt kodeord" />

          <label style={s.label}>Rolle</label>
          <select style={s.input} value={role} onChange={e => setRole(e.target.value)}>
            <option value="member">Medlem</option>
            <option value="admin">Admin</option>
          </select>

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.modalFooter}>
          <button style={s.btnSecondary} onClick={onClose}>Annuller</button>
          <button
            style={{ ...s.btnPrimary, opacity: saving || !name.trim() || !email.trim() || !password.trim() ? 0.5 : 1 }}
            onClick={handleCreate}
            disabled={saving || !name.trim() || !email.trim() || !password.trim()}
          >
            {saving ? 'Opretter…' : 'Opret'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InviteModal — vis invitationslink efter oprettelse ───────────────────────

function InviteModal({ user, password, onClose }: {
  user: User;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const loginUrl = `${window.location.origin}/login`;
  const inviteText = `Du er inviteret til Madplan 🍽️\n\nLog ind på: ${loginUrl}\nEmail: ${user.email}\nKodeord: ${password}\n\nSkift gerne kodeordet under Profil efter første login.`;

  function copyInvite() {
    navigator.clipboard.writeText(inviteText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => null);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>✅ {user.name} oprettet</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modalBody}>
          <p style={s.inviteDesc}>Kopier invitationsteksten og send den til den nye bruger:</p>
          <pre style={s.inviteBox}>{inviteText}</pre>
        </div>

        <div style={s.modalFooter}>
          <button style={s.btnSecondary} onClick={onClose}>Luk</button>
          <button style={{ ...s.btnPrimary, background: copied ? '#2e7d32' : undefined }} onClick={copyInvite}>
            {copied ? '✓ Kopieret!' : '📋 Kopiér invitation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────

function EditModal({ user, onClose, onSaved, onDeleted }: {
  user: User;
  onClose: () => void;
  onSaved: (u: User) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, string> = { name: name.trim(), email: email.trim(), role };
      if (password.trim()) body.password = password.trim();
      const updated = await apiPut<User>(`/api/users/${user.id}`, body);
      onSaved(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl');
      setSaving(false);
    }
  }

  async function handleDelete() {
    await apiDelete(`/api/users/${user.id}`).catch(() => null);
    onDeleted(user.id);
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Rediger bruger</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modalBody}>
          <label style={s.label}>Navn</label>
          <input style={s.input} value={name} onChange={e => setName(e.target.value)} />

          <label style={s.label}>Email</label>
          <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />

          <label style={s.label}>Rolle</label>
          <select style={s.input} value={role} onChange={e => setRole(e.target.value)}>
            <option value="member">Medlem</option>
            <option value="admin">Admin</option>
          </select>

          <label style={s.label}>Nyt kodeord <span style={s.hint}>(lad stå tomt for at beholde)</span></label>
          <input style={s.input} type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nyt kodeord…" />

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.modalFooter}>
          {confirmDelete ? (
            <>
              <span style={s.confirmText}>Slet {user.name}?</span>
              <button style={s.btnSecondary} onClick={() => setConfirmDelete(false)}>Nej</button>
              <button style={s.btnDanger} onClick={handleDelete}>Slet</button>
            </>
          ) : (
            <>
              <button style={s.btnDanger} onClick={() => setConfirmDelete(true)}>Slet</button>
              <button
                style={{ ...s.btnPrimary, opacity: saving ? 0.5 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Gemmer…' : 'Gem'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [invite, setInvite] = useState<{ user: User; password: string } | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);

  useEffect(() => {
    apiGet<User[]>('/api/users')
      .then(setUsers)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(user: User, password: string) {
    setUsers(prev => [...prev, user]);
    setShowCreate(false);
    setInvite({ user, password });
  }

  function handleSaved(updated: User) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setEditUser(null);
  }

  function handleDeleted(id: string) {
    setUsers(prev => prev.filter(u => u.id !== id));
    setEditUser(null);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.heading}>Brugere</h1>
        <button style={s.fabSmall} onClick={() => setShowCreate(true)}>＋</button>
      </div>

      {loading ? (
        <div style={s.empty}>Indlæser…</div>
      ) : users.length === 0 ? (
        <div style={s.empty}>Ingen brugere endnu</div>
      ) : (
        <div style={s.list}>
          {users.map(u => (
            <button key={u.id} style={s.card} onClick={() => setEditUser(u)}>
              <div style={s.cardBody}>
                <span style={s.cardName}>{u.name}</span>
                <span style={s.cardEmail}>{u.email}</span>
                <span style={s.cardMeta}>Oprettet {formatDate(u.created_at)}</span>
              </div>
              <span style={{ ...s.rolePill, ...(u.role === 'admin' ? s.rolePillAdmin : {}) }}>
                {u.role === 'admin' ? 'Admin' : 'Medlem'}
              </span>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {invite && (
        <InviteModal user={invite.user} password={invite.password} onClose={() => setInvite(null)} />
      )}
      {editUser && (
        <EditModal user={editUser} onClose={() => setEditUser(null)} onSaved={handleSaved} onDeleted={handleDeleted} />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '0 0 32px', maxWidth: 640, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 16px 12px' },
  heading: { fontSize: 24, fontWeight: 700, margin: 0 },
  fabSmall: {
    width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)',
    color: '#fff', fontSize: 24, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  },
  empty: { padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15 },
  list: { display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' },
  card: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
    textAlign: 'left', width: '100%',
  },
  cardBody: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  cardEmail: { fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardMeta: { fontSize: 12, color: 'var(--text-secondary)' },
  rolePill: {
    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
    background: '#f0f0f0', color: 'var(--text-secondary)', flexShrink: 0,
  },
  rolePillAdmin: { background: '#e3f0fc', color: '#1565C0' },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  },
  modal: {
    background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
    width: '100%', maxWidth: 640, maxHeight: '92vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  modalTitle: { fontSize: 18, fontWeight: 700, margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 },
  modalBody: {
    flex: 1, overflowY: 'auto', padding: '12px 20px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  modalFooter: {
    display: 'flex', gap: 10,
    padding: '12px 20px max(12px, env(safe-area-inset-bottom))',
    borderTop: '1px solid var(--border)', flexShrink: 0, alignItems: 'center',
  },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: -4 },
  hint: { fontWeight: 400, color: '#aaa' },
  input: {
    width: '100%', padding: '10px 12px', fontSize: 16,
    border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
    boxSizing: 'border-box' as const, background: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontFamily: 'inherit',
  },
  error: { color: '#e53935', fontSize: 13, margin: '2px 0 0' },
  confirmText: { flex: 1, fontSize: 14, color: 'var(--text-secondary)' },
  btnPrimary: {
    flex: 1, padding: '13px 0', background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  btnSecondary: {
    flex: 1, padding: '13px 0', background: '#f0f0f0', color: '#444',
    border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  btnDanger: {
    flex: 1, padding: '13px 0', background: 'none', color: 'var(--danger)',
    border: '1px solid var(--danger)', borderRadius: 12, fontSize: 15, cursor: 'pointer',
  },

  // Invite
  inviteDesc: { fontSize: 14, color: 'var(--text-secondary)', margin: 0 },
  inviteBox: {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '12px 14px', fontSize: 14,
    lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    fontFamily: 'inherit', color: 'var(--text-primary)', margin: 0,
  },
};
