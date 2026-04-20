import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from '../lib/api';

interface ShoppingItem {
  id: string;
  name: string;
  quantity: string | null;
  store: string | null;
  checked: number;
  checked_at: string | null;
  checked_by_name: string | null;
  category_id: string | null;
  category_name: string | null;
  category_sort_order: number | null;
  added_by_name: string | null;
  created_at: string;
}

interface Ingredient {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
}

interface CategoryGroup {
  category_id: string | null;
  category_name: string;
  sort_order: number;
  items: ShoppingItem[];
}

function groupByCategory(items: ShoppingItem[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const item of items) {
    const key = item.category_id ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        category_id: item.category_id,
        category_name: item.category_name ?? 'Andet',
        sort_order: item.category_sort_order ?? 99,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

function useInterval(cb: () => void, delay: number) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

export default function Shopping() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [contextItem, setContextItem] = useState<ShoppingItem | null>(null);
  const [editItem, setEditItem] = useState<ShoppingItem | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await apiGet<ShoppingItem[]>('/api/shopping');
      setItems(data);
    } catch {
      // silent poll failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchItems(); }, [fetchItems]);
  useInterval(fetchItems, 5000);

  const toggleCheck = async (item: ShoppingItem) => {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: i.checked ? 0 : 1 } : i));
    try {
      const updated = await apiPatch<ShoppingItem>(`/api/shopping/${item.id}/check`);
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? item : i)); // rollback
    }
  };

  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setContextItem(null);
    await apiDelete(`/api/shopping/${id}`);
  };

  const clearChecked = async () => {
    setItems(prev => prev.filter(i => !i.checked));
    await apiDelete('/api/shopping').catch(() => null);
  };

  const checkedCount = items.filter(i => i.checked).length;
  const uncheckedCount = items.filter(i => !i.checked).length;
  const groups = groupByCategory(items);

  if (loading) {
    return (
      <div style={s.center}>
        <span style={{ fontSize: 32 }}>🛒</span>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <span style={s.count}>{uncheckedCount} tilbage</span>
        {checkedCount > 0 && (
          <button style={s.clearBtn} onClick={clearChecked}>
            Ryd afkrydsede ({checkedCount})
          </button>
        )}
      </div>

      {/* Category groups */}
      {items.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
          <p style={{ color: 'var(--text-secondary)' }}>Indkøbslisten er tom</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Tryk ➕ for at tilføje en vare</p>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.category_id ?? 'none'} style={s.group}>
            <p style={s.groupHeader}>{group.category_name}</p>
            {group.items.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                onCheck={() => toggleCheck(item)}
                onLongPress={() => setContextItem(item)}
              />
            ))}
          </div>
        ))
      )}

      {/* FAB */}
      <button style={s.fab} onClick={() => setShowAdd(true)} aria-label="Tilføj vare">
        ➕
      </button>

      {/* Add modal */}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdded={item => { setItems(prev => [...prev, item]); setShowAdd(false); }}
        />
      )}

      {/* Context menu */}
      {contextItem && (
        <ContextMenu
          item={contextItem}
          onClose={() => setContextItem(null)}
          onEdit={() => { setEditItem(contextItem); setContextItem(null); }}
          onDelete={() => deleteItem(contextItem.id)}
        />
      )}

      {/* Edit modal */}
      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

// ─── ItemRow ────────────────────────────────────────────────────────────────

function ItemRow({ item, onCheck, onLongPress }: { item: ShoppingItem; onCheck: () => void; onLongPress: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = () => {
    timerRef.current = setTimeout(onLongPress, 500);
  };
  const handlePointerUp = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
  const handlePointerCancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div
      style={{ ...s.item, ...(item.checked ? s.itemChecked : {}) }}
      onClick={onCheck}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div style={s.checkbox}>
        {item.checked ? <span style={s.checkMark}>✓</span> : null}
      </div>
      <div style={s.itemContent}>
        <span style={{ ...s.itemName, ...(item.checked ? s.strikethrough : {}) }}>
          {item.name}
        </span>
        {(item.quantity || item.store) && (
          <span style={s.itemMeta}>
            {[item.quantity, item.store].filter(Boolean).join(' · ')}
          </span>
        )}
        {item.checked && item.checked_by_name && (
          <span style={s.checkedBy}>Krydset af {item.checked_by_name}</span>
        )}
      </div>
    </div>
  );
}

// ─── AddModal ───────────────────────────────────────────────────────────────

function AddModal({ onClose, onAdded }: { onClose: () => void; onAdded: (item: ShoppingItem) => void }) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [store, setStore] = useState('');
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onNameChange = (val: string) => {
    setName(val);
    setCategoryId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 1) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiGet<Ingredient[]>(`/api/ingredients?q=${encodeURIComponent(val)}`);
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const pickSuggestion = (ing: Ingredient) => {
    setName(ing.name);
    setCategoryId(ing.category_id);
    setSuggestions([]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const item = await apiPost<ShoppingItem>('/api/shopping', {
        name: name.trim(),
        category_id: categoryId,
        quantity: quantity.trim() || null,
        store: store.trim() || null,
      });
      onAdded(item);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />
        <h2 style={s.modalTitle}>Tilføj vare</h2>

        <div style={s.fieldWrap}>
          <input
            style={s.input}
            placeholder="Varenavn…"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div style={s.suggestions}>
              {suggestions.map(ing => (
                <button key={ing.id} style={s.suggestion} onClick={() => pickSuggestion(ing)}>
                  <span>{ing.name}</span>
                  {ing.category_name && <span style={s.suggestionCat}>{ing.category_name}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          style={s.input}
          placeholder="Antal / mængde (valgfrit)"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
        />
        <input
          style={s.input}
          placeholder="Butik (valgfrit)"
          value={store}
          onChange={e => setStore(e.target.value)}
        />

        <div style={s.modalButtons}>
          <button style={s.cancelBtn} onClick={onClose}>Annuller</button>
          <button style={{ ...s.saveBtn, opacity: saving || !name.trim() ? 0.6 : 1 }} onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Tilføjer…' : 'Tilføj'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditModal ───────────────────────────────────────────────────────────────

function EditModal({ item, onClose, onSaved }: { item: ShoppingItem; onClose: () => void; onSaved: (item: ShoppingItem) => void }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? '');
  const [store, setStore] = useState(item.store ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await apiPut<ShoppingItem>(`/api/shopping/${item.id}`, {
        name: name.trim(),
        quantity: quantity.trim() || null,
        store: store.trim() || null,
        category_id: item.category_id,
      });
      onSaved(updated);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />
        <h2 style={s.modalTitle}>Rediger vare</h2>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Varenavn" />
        <input style={s.input} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Antal / mængde" />
        <input style={s.input} value={store} onChange={e => setStore(e.target.value)} placeholder="Butik" />
        <div style={s.modalButtons}>
          <button style={s.cancelBtn} onClick={onClose}>Annuller</button>
          <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Gemmer…' : 'Gem'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────

function ContextMenu({ item, onClose, onEdit, onDelete }: { item: ShoppingItem; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />
        <p style={s.contextTitle}>{item.name}</p>
        <button style={s.contextAction} onClick={onEdit}>✏️ Rediger</button>
        <button style={{ ...s.contextAction, color: 'var(--danger)' }} onClick={onDelete}>🗑️ Slet</button>
        <button style={{ ...s.contextAction, color: 'var(--text-secondary)' }} onClick={onClose}>Annuller</button>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { paddingBottom: 80 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10,
  },
  count: { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' },
  clearBtn: {
    fontSize: 13, color: 'var(--danger)', background: 'none', border: 'none',
    cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
    minHeight: 44, display: 'flex', alignItems: 'center',
  },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh' },
  group: { marginBottom: 4 },
  groupHeader: {
    fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-secondary)', padding: '12px 16px 4px',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border)', minHeight: 56,
    cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
    transition: 'background 0.1s',
  },
  itemChecked: { background: '#fafafa' },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, border: '2px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, background: 'var(--bg-primary)',
  },
  checkMark: { color: 'var(--accent)', fontSize: 14, fontWeight: 700 },
  itemContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  itemName: { fontSize: 16, color: 'var(--text-primary)' },
  strikethrough: { textDecoration: 'line-through', color: 'var(--text-secondary)' },
  itemMeta: { fontSize: 13, color: 'var(--text-secondary)' },
  checkedBy: { fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' },
  fab: {
    position: 'fixed', bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 16px)',
    right: 20, width: 56, height: 56, borderRadius: 28,
    background: 'var(--accent)', color: '#fff', fontSize: 24,
    border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(76,175,80,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    zIndex: 200, display: 'flex', alignItems: 'flex-end',
  },
  modal: {
    width: '100%', background: 'var(--bg-card)',
    borderRadius: '20px 20px 0 0',
    padding: '12px 16px calc(24px + env(safe-area-inset-bottom))',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  modalHandle: { width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 8px' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  fieldWrap: { position: 'relative' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-primary)',
    fontSize: 16, minHeight: 44, outline: 'none', color: 'var(--text-primary)',
  },
  suggestions: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '0 0 8px 8px', zIndex: 10, maxHeight: 200, overflowY: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  suggestion: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '12px 14px', background: 'none', border: 'none',
    borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 15,
    color: 'var(--text-primary)', minHeight: 44, textAlign: 'left',
  },
  suggestionCat: { fontSize: 12, color: 'var(--text-secondary)' },
  modalButtons: { display: 'flex', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 8, background: 'var(--bg-primary)',
    border: '1px solid var(--border)', fontSize: 16, cursor: 'pointer',
    color: 'var(--text-primary)', minHeight: 44,
  },
  saveBtn: {
    flex: 2, padding: 14, borderRadius: 8, background: 'var(--accent)',
    border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    color: '#fff', minHeight: 44,
  },
  contextTitle: { fontSize: 16, fontWeight: 600, padding: '4px 0 8px', color: 'var(--text-primary)' },
  contextAction: {
    width: '100%', padding: '14px 4px', background: 'none', border: 'none',
    fontSize: 16, cursor: 'pointer', textAlign: 'left', minHeight: 44,
    color: 'var(--text-primary)',
  },
};
