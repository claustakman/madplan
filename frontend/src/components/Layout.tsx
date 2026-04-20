import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/login');
  };

  return (
    <div style={styles.root}>
      <main style={styles.main}>
        <Outlet />
      </main>

      <nav style={styles.nav}>
        <NavLink to="/indkobsliste" style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navActive : {}) })}>
          <span style={styles.navIcon}>🛒</span>
          <span style={styles.navLabel}>Indkøb</span>
        </NavLink>
        <NavLink to="/madplan" style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navActive : {}) })}>
          <span style={styles.navIcon}>🍽️</span>
          <span style={styles.navLabel}>Madplan</span>
        </NavLink>
        <NavLink to="/opskrifter" style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navActive : {}) })}>
          <span style={styles.navIcon}>📖</span>
          <span style={styles.navLabel}>Opskrifter</span>
        </NavLink>
        <button style={styles.navItem} onClick={() => setMenuOpen(true)}>
          <span style={styles.navIcon}>☰</span>
          <span style={styles.navLabel}>Mere</span>
        </button>
      </nav>

      {menuOpen && (
        <div style={styles.overlay} onClick={() => setMenuOpen(false)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHandle} />

            <div style={styles.sheetUser}>
              <span style={styles.sheetUserName}>{user?.name}</span>
              <span style={styles.sheetUserRole}>{user?.role === 'admin' ? 'Admin' : 'Medlem'}</span>
            </div>

            <div style={styles.sheetDivider} />

            <button style={styles.sheetItem} onClick={() => { navigate('/arkiv'); setMenuOpen(false); }}>
              📅 Arkiv
            </button>
            <button style={styles.sheetItem} onClick={() => { navigate('/profil'); setMenuOpen(false); }}>
              👤 Profil
            </button>
            {user?.role === 'admin' && (
              <button style={styles.sheetItem} onClick={() => { navigate('/brugere'); setMenuOpen(false); }}>
                👥 Brugere
              </button>
            )}

            <div style={styles.sheetDivider} />

            <button style={{ ...styles.sheetItem, color: 'var(--danger)' }} onClick={handleLogout}>
              Log ud
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom))',
  },
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 'calc(var(--nav-height) + env(safe-area-inset-bottom))',
    paddingBottom: 'env(safe-area-inset-bottom)',
    background: 'var(--bg-card)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    zIndex: 100,
    boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
  },
  navItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '8px 4px',
    color: 'var(--text-secondary)',
    minHeight: 44,
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'color 0.15s',
  },
  navActive: {
    color: 'var(--accent)',
  },
  navIcon: {
    fontSize: 22,
    lineHeight: 1,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: 500,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    background: 'var(--bg-card)',
    borderRadius: '20px 20px 0 0',
    padding: '12px 0 calc(24px + env(safe-area-inset-bottom))',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    background: 'var(--border)',
    borderRadius: 2,
    margin: '0 auto 20px',
  },
  sheetUser: {
    padding: '0 20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sheetUserName: {
    fontSize: 18,
    fontWeight: 600,
  },
  sheetUserRole: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  sheetDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 0',
  },
  sheetItem: {
    display: 'block',
    width: '100%',
    padding: '14px 20px',
    textAlign: 'left',
    fontSize: 16,
    color: 'var(--text-primary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
};
