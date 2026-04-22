import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  added_by: string | null;
  added_by_name: string | null;
  times_bought: number;
  created_at: string;
}

interface Ingredient {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  times_bought: number;
  default_quantity: string | null;
  default_store: string | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface CategoryGroup {
  category_id: string | null;
  category_name: string;
  sort_order: number;
  items: ShoppingItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function Shopping() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [detailItem, setDetailItem] = useState<ShoppingItem | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await apiGet<ShoppingItem[]>('/api/shopping');
      setItems(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchItems(); }, [fetchItems]);
  useInterval(fetchItems, 5000);

  const toggleCheck = async (item: ShoppingItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: i.checked ? 0 : 1 } : i));
    try {
      const updated = await apiPatch<ShoppingItem>(`/api/shopping/${item.id}/check`);
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    }
  };

  const deleteItem = async (id: string) => {
    setDetailItem(null);
    setItems(prev => prev.filter(i => i.id !== id));
    await apiDelete(`/api/shopping/${id}`).catch(() => null);
  };

  const clearChecked = async () => {
    setItems(prev => prev.filter(i => !i.checked));
    await apiDelete('/api/shopping').catch(() => null);
  };

  const onAdded = (item: ShoppingItem) => {
    setItems(prev => [...prev, item]);
  };

  const onUpdated = (item: ShoppingItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? item : i));
    setDetailItem(item);
  };

  const checkedCount = items.filter(i => i.checked).length;
  const uncheckedCount = items.filter(i => !i.checked).length;
  const uncheckedGroups = groupByCategory(items.filter(i => !i.checked));
  const checkedGroups = groupByCategory(items.filter(i => Boolean(i.checked)));

  if (loading) return <div style={s.center}><span style={{ fontSize: 32 }}>🛒</span></div>;

  return (
    <div style={s.page}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <span style={s.count}>{uncheckedCount} tilbage</span>
      </div>

      {/* Liste */}
      {items.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
          <p style={{ color: 'var(--text-secondary)' }}>Indkøbslisten er tom</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Tryk ➕ for at tilføje</p>
        </div>
      ) : (
        <>
          {uncheckedGroups.map(group => (
            <div key={group.category_id ?? 'none'} style={s.group}>
              <p style={s.groupHeader}>{group.category_name}</p>
              {group.items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onCheck={() => toggleCheck(item)}
                  onLongPress={() => setDetailItem(item)}
                />
              ))}
            </div>
          ))}

          {checkedGroups.length > 0 && (
            <div style={s.checkedSection}>
              <div style={s.checkedHeaderRow}>
                <p style={s.checkedHeader}>Afkrydset ({checkedCount})</p>
                <button style={s.clearBtn} onClick={clearChecked}>Ryd alle</button>
              </div>
              {checkedGroups.map(group => (
                <div key={group.category_id ?? 'none'}>
                  {checkedGroups.length > 1 && (
                    <p style={s.checkedGroupLabel}>{group.category_name}</p>
                  )}
                  {group.items.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onCheck={() => toggleCheck(item)}
                      onLongPress={() => setDetailItem(item)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* FAB */}
      <button style={s.fab} onClick={() => setShowAdd(true)} aria-label="Tilføj vare">➕</button>

      {/* Add-modal */}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdded={item => { onAdded(item); setShowAdd(false); }}
        />
      )}

      {/* Detalje-panel */}
      {detailItem && (
        <DetailPanel
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onUpdated={onUpdated}
          onDeleted={() => deleteItem(detailItem.id)}
        />
      )}
    </div>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({ item, onCheck, onLongPress }: {
  item: ShoppingItem; onCheck: () => void; onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isChecked = Boolean(item.checked);
  const showQty = item.quantity && item.quantity !== '1';

  const handlePointerDown = (e: React.PointerEvent) => {
    timerRef.current = setTimeout(onLongPress, 500);
  };
  const clearTimer = () => { if (timerRef.current) clearTimeout(timerRef.current); };

  return (
    <div
      style={{ ...s.item, ...(isChecked ? s.itemChecked : {}) }}
      onClick={onCheck}
      onPointerDown={handlePointerDown}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
    >
      <div style={{ ...s.checkbox, ...(isChecked ? s.checkboxChecked : {}) }}>
        {isChecked && <span style={s.checkMark}>✓</span>}
      </div>
      <div style={s.itemContent}>
        <span style={{ ...s.itemName, ...(isChecked ? s.strikethrough : {}) }}>
          {showQty && <span style={s.itemQty}>{item.quantity} </span>}
          {item.name}
        </span>
        {item.store && (
          <span style={s.itemStore}>{item.store}</span>
        )}
      </div>
      {/* Detalje-knap til desktop/mus */}
      <button
        style={s.detailTrigger}
        onClick={e => { e.stopPropagation(); onLongPress(); }}
        aria-label="Detaljer"
      >
        ⋯
      </button>
    </div>
  );
}

// ─── AddModal — ét klik tilføjer, fritekst → vælg kategori ───────────────────

function AddModal({ onClose, onAdded }: {
  onClose: () => void; onAdded: (item: ShoppingItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noMatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    apiGet<Category[]>('/api/ingredients/categories').then(setCategories).catch(() => null);
  }, []);

  const search = (val: string) => {
    setQuery(val);
    // Clear noMatch immediately on new input so category grid disappears while typing
    if (noMatchRef.current) clearTimeout(noMatchRef.current);
    setNoMatch(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const data = await apiGet<Ingredient[]>(`/api/ingredients?q=${encodeURIComponent(val)}`).catch(() => []);
      setSuggestions(data);
      if (data.length === 0) {
        // Delay showing the "no match" category grid by 600ms to avoid flicker while typing
        noMatchRef.current = setTimeout(() => setNoMatch(true), 600);
      }
    }, 300);
  };

  // Ét-klik tilføj fra forslag
  const addFromSuggestion = async (ing: Ingredient) => {
    if (adding) return;
    setAdding(true);
    const item = await apiPost<ShoppingItem>('/api/shopping', {
      name: ing.name,
      category_id: ing.category_id,
      quantity: ing.default_quantity ?? null,
      store: ing.default_store ?? null,
    }).catch(() => null);
    setAdding(false);
    if (item) onAdded(item);
  };

  // Tilføj fritekst med kategori
  const addFreetext = async (categoryId: string | null) => {
    if (!query.trim() || adding) return;
    setAdding(true);
    // Gem i katalog
    await apiPost('/api/ingredients', { name: query.trim(), category_id: categoryId }).catch(() => null);
    // Tilføj til liste
    const item = await apiPost<ShoppingItem>('/api/shopping', {
      name: query.trim(),
      category_id: categoryId,
    }).catch(() => null);
    setAdding(false);
    if (item) onAdded(item);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />

        <div style={s.searchWrap}>
          <input
            ref={inputRef}
            style={s.searchInput}
            placeholder="Søg eller skriv varenavn…"
            value={query}
            onChange={e => search(e.target.value)}
          />
        </div>

        {/* Forslag */}
        {suggestions.length > 0 && (
          <div style={s.suggestionList}>
            {suggestions.map(ing => (
              <button
                key={ing.id}
                style={s.suggestionRow}
                onClick={() => addFromSuggestion(ing)}
                disabled={adding}
              >
                <span style={s.sugName}>{ing.name}</span>
                <span style={s.sugCat}>{ing.category_name ?? ''}</span>
              </button>
            ))}
          </div>
        )}

        {/* Ingen match — vælg kategori */}
        {noMatch && query.trim() && (
          <div style={s.noMatchWrap}>
            <p style={s.noMatchTitle}>
              "{query}" findes ikke — vælg kategori:
            </p>
            <div style={s.catGrid}>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  style={s.catBtn}
                  onClick={() => addFreetext(cat.id)}
                  disabled={adding}
                >
                  {cat.name}
                </button>
              ))}
              <button style={{ ...s.catBtn, color: 'var(--text-secondary)' }} onClick={() => addFreetext(null)} disabled={adding}>
                Uden kategori
              </button>
            </div>
          </div>
        )}

        <button style={s.cancelBtnFull} onClick={onClose}>Luk</button>
      </div>
    </div>
  );
}

// ─── DetailPanel — rediger antal/butik, vis stats ────────────────────────────

function DetailPanel({ item, onClose, onUpdated, onDeleted }: {
  item: ShoppingItem;
  onClose: () => void;
  onUpdated: (item: ShoppingItem) => void;
  onDeleted: () => void;
}) {
  const [quantity, setQuantity] = useState(item.quantity ?? '');
  const [store, setStore] = useState(item.store ?? '');
  const [categoryId, setCategoryId] = useState(item.category_id ?? '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Category[]>('/api/ingredients/categories').then(setCategories).catch(() => null);
  }, []);

  const hasChanges =
    quantity !== (item.quantity ?? '') ||
    store !== (item.store ?? '') ||
    (categoryId || null) !== item.category_id;

  const save = async () => {
    if (!hasChanges) return;
    setSaving(true);
    const updated = await apiPut<ShoppingItem>(`/api/shopping/${item.id}`, {
      name: item.name,
      category_id: categoryId || null,
      quantity: quantity.trim() || null,
      store: store.trim() || null,
    }).catch(() => null);
    setSaving(false);
    if (updated) onUpdated(updated);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />
        <h2 style={s.detailName}>{item.name}</h2>

        <div style={s.detailStats}>
          {item.added_by_name && (
            <span style={s.stat}>👤 Tilføjet af {item.added_by_name}</span>
          )}
          {Number(item.times_bought) > 0 && (
            <span style={s.stat}>🛒 Købt {item.times_bought} {Number(item.times_bought) === 1 ? 'gang' : 'gange'}</span>
          )}
        </div>

        <div style={s.detailFields}>
          <div style={s.detailField}>
            <label style={s.detailLabel}>Kategori</label>
            <select
              style={s.input}
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">Uden kategori</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={s.detailField}>
            <label style={s.detailLabel}>Antal / mængde</label>
            <input
              style={s.input}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="fx 2 stk, 500g…"
            />
          </div>
          <div style={s.detailField}>
            <label style={s.detailLabel}>Butik</label>
            <input
              style={s.input}
              value={store}
              onChange={e => setStore(e.target.value)}
              placeholder="fx Lidl, Meny…"
            />
          </div>
        </div>

        <div style={s.detailActions}>
          {hasChanges ? (
            <button
              style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Gemmer…' : 'Gem'}
            </button>
          ) : (
            <button style={s.cancelBtn} onClick={onClose}>Luk</button>
          )}
          <button style={s.deleteBtn} onClick={onDeleted}>🗑️ Slet</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    cursor: 'pointer', padding: '6px 10px', borderRadius: 6, minHeight: 44,
  },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh' },

  group: { marginBottom: 4 },
  groupHeader: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
    color: 'var(--accent-dark)', padding: '8px 16px 6px',
    background: '#e3f0fc', borderBottom: '1px solid #b3d1f0',
  },
  checkedSection: { marginTop: 16 },
  checkedHeaderRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)',
    paddingRight: 8,
  },
  checkedHeader: {
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
    color: 'var(--text-secondary)', padding: '8px 16px 6px',
    margin: 0,
  },
  checkedGroupLabel: {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
    color: 'var(--text-secondary)', padding: '6px 16px 4px',
    background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)',
    opacity: 0.7,
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 16px', background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border)', minHeight: 44,
    cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
  },
  itemChecked: { background: '#f9f9f9' },
  checkbox: {
    width: 26, height: 26, borderRadius: 7, border: '2px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'all 0.15s',
  },
  checkboxChecked: { background: 'var(--accent)', borderColor: 'var(--accent)' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: 700 },
  itemContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  itemName: { fontSize: 16, color: 'var(--text-primary)' },
  strikethrough: { textDecoration: 'line-through', color: 'var(--text-secondary)' },
  itemMeta: { fontSize: 13, display: 'flex', alignItems: 'center', gap: 0 },
  itemQty: { fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 },
  itemMetaSep: { color: 'var(--text-secondary)', fontSize: 13 },
  itemStore: { color: '#7B1FA2', fontSize: 13 },
  checkedBy: { fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' },
  itemByLine: { fontSize: 12, color: 'var(--text-secondary)' },
  detailTrigger: {
    flexShrink: 0, width: 36, height: 44, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 20, color: 'var(--text-secondary)', borderRadius: 8,
    marginRight: -8,
  },

  fab: {
    position: 'fixed',
    bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 16px)',
    right: 20, width: 56, height: 56, borderRadius: 28,
    background: 'var(--accent)', color: '#fff', fontSize: 24,
    border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(25,118,210,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
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
    maxHeight: '90dvh', overflowY: 'auto',
  },
  modalHandle: { width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 8px', flexShrink: 0 },

  // Add modal
  searchWrap: { position: 'relative' },
  searchInput: {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1.5px solid var(--accent)', background: 'var(--bg-primary)',
    fontSize: 16, minHeight: 48, outline: 'none', color: 'var(--text-primary)',
  },
  suggestionList: { display: 'flex', flexDirection: 'column', gap: 0 },
  suggestionRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '13px 4px', background: 'none', border: 'none',
    borderBottom: '1px solid var(--border)', cursor: 'pointer',
    fontSize: 15, color: 'var(--text-primary)', minHeight: 48, textAlign: 'left',
  },
  sugName: { fontWeight: 500 },
  sugCat: { fontSize: 12, color: 'var(--text-secondary)' },

  noMatchWrap: { paddingTop: 4 },
  noMatchTitle: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10 },
  catGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  catBtn: {
    padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)',
    background: 'var(--bg-primary)', fontSize: 13, cursor: 'pointer',
    color: 'var(--text-primary)', minHeight: 36,
  },
  cancelBtnFull: {
    width: '100%', padding: 14, borderRadius: 8,
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    fontSize: 16, cursor: 'pointer', color: 'var(--text-secondary)', minHeight: 44,
  },

  // Detail panel
  detailName: { fontSize: 20, fontWeight: 700, paddingBottom: 2 },
  detailCat: { fontSize: 13, color: 'var(--text-secondary)' },
  detailStats: { display: 'flex', gap: 16, flexWrap: 'wrap', padding: '4px 0 8px' },
  stat: { fontSize: 13, color: 'var(--text-secondary)' },
  detailFields: { display: 'flex', flexDirection: 'column', gap: 10 },
  detailField: { display: 'flex', flexDirection: 'column', gap: 5 },
  detailLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-primary)',
    fontSize: 16, minHeight: 44, outline: 'none', color: 'var(--text-primary)',
  },
  detailActions: { display: 'flex', gap: 10, paddingTop: 4 },
  saveBtn: {
    flex: 1, padding: 14, borderRadius: 8, background: 'var(--accent)',
    border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer', color: '#fff', minHeight: 44,
  },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 8,
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    fontSize: 16, cursor: 'pointer', color: 'var(--text-primary)', minHeight: 44,
  },
  deleteBtn: {
    padding: '14px 18px', borderRadius: 8, background: '#fff0f0',
    border: '1px solid #ffcccc', fontSize: 15, cursor: 'pointer',
    color: 'var(--danger)', minHeight: 44,
  },
};
