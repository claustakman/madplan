import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';

interface Ingredient {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  default_quantity: string | null;
  default_store: string | null;
  times_bought: number;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

type Tab = 'ingredienser' | 'kategorier';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('ingredienser');

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Katalog</h1>
      </div>

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === 'ingredienser' ? s.tabActive : {}) }} onClick={() => setTab('ingredienser')}>
          Ingredienser
        </button>
        <button style={{ ...s.tab, ...(tab === 'kategorier' ? s.tabActive : {}) }} onClick={() => setTab('kategorier')}>
          Kategorier
        </button>
      </div>

      {tab === 'ingredienser' ? <IngredientsTab /> : <CategoriesTab />}
    </div>
  );
}

// ─── Ingredienser-fane ────────────────────────────────────────────────────────

function IngredientsTab() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Ingredient | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const [ings, cats] = await Promise.all([
      apiGet<Ingredient[]>('/api/ingredients'),
      apiGet<Category[]>('/api/ingredients/categories'),
    ]);
    setItems(ings);
    setCategories(cats);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = search.trim()
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const handleDelete = async (id: string) => {
    if (!confirm('Slet ingrediens?')) return;
    await apiDelete(`/api/ingredients/${id}`);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSaved = (updated: Ingredient) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditItem(null);
  };

  const handleAdded = (ing: Ingredient) => {
    setItems(prev => [ing, ...prev]);
    setShowAdd(false);
  };

  if (loading) return <div style={s.center}>Indlæser…</div>;

  return (
    <div>
      <div style={s.listToolbar}>
        <input
          style={s.searchInput}
          placeholder="Søg ingredienser…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button style={s.addBtn} onClick={() => setShowAdd(true)}>+ Ny</button>
      </div>

      <div style={s.list}>
        {filtered.map(ing => (
          <div key={ing.id} style={s.row}>
            <div style={s.rowContent}>
              <span style={s.rowName}>{ing.name}</span>
              <span style={s.rowMeta}>
                {ing.category_name ?? 'Ingen kategori'}
                {ing.default_quantity ? ` · ${ing.default_quantity}` : ''}
                {ing.default_store ? ` · ${ing.default_store}` : ''}
              </span>
            </div>
            {Number(ing.times_bought) > 0 && (
              <span style={s.timesBought}>🛒 {ing.times_bought}</span>
            )}
            <div style={s.rowActions}>
              <button style={s.editBtn} onClick={() => setEditItem(ing)}>✏️</button>
              <button style={s.deleteBtn} onClick={() => handleDelete(ing.id)}>🗑️</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={s.empty}>Ingen ingredienser fundet</p>
        )}
      </div>

      {editItem && (
        <IngredientModal
          ingredient={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSaved={handleSaved}
        />
      )}
      {showAdd && (
        <IngredientModal
          ingredient={null}
          categories={categories}
          onClose={() => setShowAdd(false)}
          onSaved={handleAdded}
        />
      )}
    </div>
  );
}

function IngredientModal({ ingredient, categories, onClose, onSaved }: {
  ingredient: Ingredient | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (i: Ingredient) => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [categoryId, setCategoryId] = useState(ingredient?.category_id ?? '');
  const [defaultQty, setDefaultQty] = useState(ingredient?.default_quantity ?? '');
  const [defaultStore, setDefaultStore] = useState(ingredient?.default_store ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const body = {
      name: name.trim(),
      category_id: categoryId || null,
      default_quantity: defaultQty.trim() || null,
      default_store: defaultStore.trim() || null,
    };
    const result = ingredient
      ? await apiPut<Ingredient>(`/api/ingredients/${ingredient.id}`, body)
      : await apiPost<Ingredient>('/api/ingredients', body);
    setSaving(false);
    onSaved(result);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />
        <h2 style={s.modalTitle}>{ingredient ? 'Rediger ingrediens' : 'Ny ingrediens'}</h2>

        <label style={s.label}>Navn</label>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ingrediensnavn" autoFocus />

        <label style={s.label}>Kategori</label>
        <select style={s.select} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Ingen kategori</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={s.label}>Standard antal / mængde</label>
        <input style={s.input} value={defaultQty} onChange={e => setDefaultQty(e.target.value)} placeholder="fx 2 stk, 500g" />

        <label style={s.label}>Standard butik</label>
        <input style={s.input} value={defaultStore} onChange={e => setDefaultStore(e.target.value)} placeholder="fx Lidl, Meny" />

        <div style={s.modalBtns}>
          <button style={s.cancelBtnM} onClick={onClose}>Annuller</button>
          <button style={{ ...s.saveBtnM, opacity: saving || !name.trim() ? 0.6 : 1 }} onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Gemmer…' : 'Gem'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Kategorier-fane ──────────────────────────────────────────────────────────

function CategoriesTab() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const data = await apiGet<Category[]>('/api/ingredients/categories');
    setCats(data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Slet kategorien "${cat.name}"? Ingredienser i kategorien mister deres tilknytning.`)) return;
    await apiDelete(`/api/ingredients/categories/${cat.id}`);
    setCats(prev => prev.filter(c => c.id !== cat.id));
  };

  const handleSaved = (updated: Category, isNew: boolean) => {
    if (isNew) {
      setCats(prev => [...prev, updated].sort((a, b) => a.sort_order - b.sort_order));
    } else {
      setCats(prev => prev.map(c => c.id === updated.id ? updated : c).sort((a, b) => a.sort_order - b.sort_order));
    }
    setEditCat(null);
    setShowAdd(false);
  };

  if (loading) return <div style={s.center}>Indlæser…</div>;

  return (
    <div>
      <div style={s.listToolbar}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{cats.length} kategorier</span>
        <button style={s.addBtn} onClick={() => setShowAdd(true)}>+ Ny</button>
      </div>

      <div style={s.list}>
        {cats.map(cat => (
          <div key={cat.id} style={s.row}>
            <div style={s.rowContent}>
              <span style={s.rowName}>{cat.name}</span>
              <span style={s.rowMeta}>Rækkefølge: {cat.sort_order}</span>
            </div>
            <div style={s.rowActions}>
              <button style={s.editBtn} onClick={() => setEditCat(cat)}>✏️</button>
              <button style={s.deleteBtn} onClick={() => handleDelete(cat)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {editCat && (
        <CategoryModal
          category={editCat}
          onClose={() => setEditCat(null)}
          onSaved={c => handleSaved(c, false)}
        />
      )}
      {showAdd && (
        <CategoryModal
          category={null}
          onClose={() => setShowAdd(false)}
          onSaved={c => handleSaved(c, true)}
        />
      )}
    </div>
  );
}

function CategoryModal({ category, onClose, onSaved }: {
  category: Category | null;
  onClose: () => void;
  onSaved: (c: Category) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? '50'));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const body = { name: name.trim(), sort_order: parseInt(sortOrder) || 50 };
    const result = category
      ? await apiPut<Category>(`/api/ingredients/categories/${category.id}`, body)
      : await apiPost<Category>('/api/ingredients/categories', body);
    setSaving(false);
    onSaved(result);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHandle} />
        <h2 style={s.modalTitle}>{category ? 'Rediger kategori' : 'Ny kategori'}</h2>

        <label style={s.label}>Navn</label>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Kategorinavn" autoFocus />

        <label style={s.label}>Rækkefølge i butik</label>
        <input style={s.input} type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="fx 1-99" />
        <p style={s.hint}>Lavere tal = vises først i indkøbslisten</p>

        <div style={s.modalBtns}>
          <button style={s.cancelBtnM} onClick={onClose}>Annuller</button>
          <button style={{ ...s.saveBtnM, opacity: saving || !name.trim() ? 0.6 : 1 }} onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Gemmer…' : 'Gem'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { paddingBottom: 80 },
  header: { padding: '20px 16px 0' },
  title: { fontSize: 22, fontWeight: 700 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30vh', color: 'var(--text-secondary)' },

  tabs: {
    display: 'flex', gap: 0, padding: '12px 16px',
    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0,
    background: 'var(--bg-primary)', zIndex: 10,
  },
  tab: {
    flex: 1, padding: '10px 0', background: 'none', border: 'none',
    borderBottom: '2px solid transparent', fontSize: 15, fontWeight: 500,
    cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.15s',
  },
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },

  listToolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', gap: 10,
  },
  searchInput: {
    flex: 1, padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    fontSize: 16, outline: 'none', color: 'var(--text-primary)',
  },
  addBtn: {
    padding: '10px 16px', borderRadius: 8, background: 'var(--accent)',
    border: 'none', color: '#fff', fontWeight: 600, fontSize: 14,
    cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 44,
  },

  list: {},
  row: {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
    background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
    gap: 12, minHeight: 56,
  },
  rowContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  rowName: { fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' },
  rowMeta: { fontSize: 12, color: 'var(--text-secondary)' },
  rowActions: { display: 'flex', gap: 4 },
  timesBought: { fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginRight: 4 },
  editBtn: {
    width: 36, height: 36, borderRadius: 8, background: 'var(--bg-primary)',
    border: '1px solid var(--border)', cursor: 'pointer', fontSize: 15,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 8, background: '#fff0f0',
    border: '1px solid #ffcccc', cursor: 'pointer', fontSize: 15,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  empty: { padding: '24px 16px', color: 'var(--text-secondary)', fontSize: 14 },

  // Modal
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
  modalHandle: { width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 8px' },
  modalTitle: { fontSize: 18, fontWeight: 700 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: -4 },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-primary)',
    fontSize: 16, minHeight: 44, outline: 'none', color: 'var(--text-primary)',
  },
  select: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-primary)',
    fontSize: 16, minHeight: 44, color: 'var(--text-primary)',
  },
  hint: { fontSize: 12, color: 'var(--text-secondary)', marginTop: -4 },
  modalBtns: { display: 'flex', gap: 10, marginTop: 4 },
  cancelBtnM: {
    flex: 1, padding: 14, borderRadius: 8,
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    fontSize: 16, cursor: 'pointer', color: 'var(--text-primary)', minHeight: 44,
  },
  saveBtnM: {
    flex: 2, padding: 14, borderRadius: 8, background: 'var(--accent)',
    border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    color: '#fff', minHeight: 44,
  },
};
