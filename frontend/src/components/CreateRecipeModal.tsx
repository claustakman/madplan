import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecipeData {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  servings: number;
  prep_minutes: number | null;
  tags: string;
  rating: number;
  created_by: string;
  created_at: string;
  ingredients?: RecipeIngredient[];
}

// Keep old name as alias so MealPlan.tsx import keeps working
export type CreatedRecipe = RecipeData;

export interface CreateRecipeModalProps {
  initialTitle?: string;
  onCreated: (r: RecipeData) => void;
  onClose: () => void;
}

export interface RecipeFormProps {
  recipe?: RecipeData;           // present → edit mode
  initialTitle?: string;         // create mode only
  onSaved: (r: RecipeData) => void;
  onCancel: () => void;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  name: string;
  quantity: string | null;
  category_id: string | null;
  sort_order: number;
}

interface Ingredient {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  default_quantity: string | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function ingredientsToText(ings: RecipeIngredient[]): string {
  return ings.map(i => i.quantity ? `${i.quantity} ${i.name}` : i.name).join('\n');
}

// Parse a freetext line like "3 løg" or "500g hakket oksekød" into { quantity, name }.
// Quantity prefix patterns: leading digits/fractions with optional unit (g, kg, ml, l, dl, stk, fed, etc.)
const QTY_RE = /^(\d[\d/.,]*\s*(?:g|kg|ml|l|dl|cl|stk\.?|fed|bundt|dåse|pose|pk\.?|spsk\.?|tsk\.?|nip|hånd(?:fuld)?)?)\s+(.+)/i;

export function textToIngredients(text: string, recipeId: string): RecipeIngredient[] {
  return text.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const m = trimmed.match(QTY_RE);
    const quantity = m ? m[1].trim() : null;
    const name = m ? m[2].trim() : trimmed;
    return { id: crypto.randomUUID(), recipe_id: recipeId, ingredient_id: null, name, quantity, category_id: null, sort_order: idx };
  }).filter(Boolean) as RecipeIngredient[];
}

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

// ─── Tag autocomplete ─────────────────────────────────────────────────────────

const ALL_TAGS = [
  'vegetar', 'fisk', 'kylling', 'oksekød', 'pasta', 'suppe', 'salat',
  'dessert', 'hurtig', 'grill', 'jul', 'italiensk', 'asiatisk', 'mexicansk',
  'indisk', 'græsk', 'mellemøstlig', 'nordisk', 'fransk', 'spansk',
];

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = ALL_TAGS.filter(t =>
    !tags.includes(t) && t.startsWith(input.toLowerCase().trim())
  );

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
    setShowDrop(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.key === ',' || e.key === 'Enter') && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div style={ts.wrap} onClick={() => inputRef.current?.focus()}>
      {tags.map(tag => (
        <span key={tag} style={ts.pill}>
          {tag}
          <button type="button" style={ts.pillX} onClick={e => { e.stopPropagation(); removeTag(tag); }}>×</button>
        </span>
      ))}
      <div style={{ position: 'relative', flex: 1, minWidth: 80 }}>
        <input
          ref={inputRef}
          style={ts.input}
          value={input}
          onChange={e => { setInput(e.target.value); setShowDrop(true); }}
          onFocus={() => setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          onKeyDown={handleKey}
          placeholder={tags.length === 0 ? 'Tilføj tags…' : ''}
        />
        {showDrop && (filtered.length > 0 || input.trim()) && (
          <div style={ts.drop}>
            {filtered.map(t => (
              <button key={t} type="button" style={ts.dropItem} onMouseDown={() => addTag(t)}>{t}</button>
            ))}
            {input.trim() && !ALL_TAGS.includes(input.trim().toLowerCase()) && !tags.includes(input.trim().toLowerCase()) && (
              <button type="button" style={{ ...ts.dropItem, color: 'var(--accent)' }} onMouseDown={() => addTag(input)}>
                + Tilføj "{input.trim()}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ts: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
    padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg-primary)', cursor: 'text', minHeight: 44,
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: '#e3f0fc', color: '#1565C0', borderRadius: 20,
    padding: '3px 10px', fontSize: 13, fontWeight: 500,
  },
  pillX: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#1565C0', fontSize: 15, lineHeight: 1, padding: '0 0 0 2px',
  },
  input: {
    border: 'none', outline: 'none', background: 'transparent',
    fontSize: 15, color: 'var(--text-primary)', width: '100%', minHeight: 28,
  },
  drop: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 50, overflow: 'hidden',
  },
  dropItem: {
    display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
    background: 'none', border: 'none', fontSize: 14, cursor: 'pointer',
    color: 'var(--text-primary)', borderBottom: '1px solid var(--border)',
  },
};

// ─── IngredientRow ────────────────────────────────────────────────────────────

function IngredientRow({ ing, onChange, onRemove }: {
  ing: RecipeIngredient;
  onChange: (u: RecipeIngredient) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState(ing.name);
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDrop(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleNameChange(val: string) {
    setQuery(val);
    onChange({ ...ing, name: val, ingredient_id: null, category_id: null });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 1) { setSuggestions([]); setShowDrop(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiGet<Ingredient[]>(`/api/ingredients?q=${encodeURIComponent(val)}`);
        setSuggestions(data);
        setShowDrop(data.length > 0);
      } catch { /* ignore */ }
    }, 300);
  }

  function selectSuggestion(sg: Ingredient) {
    setQuery(sg.name);
    setShowDrop(false);
    setSuggestions([]);
    onChange({ ...ing, name: sg.name, ingredient_id: sg.id, category_id: sg.category_id, quantity: ing.quantity ?? sg.default_quantity });
  }

  return (
    <div style={s.ingRow}>
      <input style={s.ingQty} value={ing.quantity ?? ''} onChange={e => onChange({ ...ing, quantity: e.target.value || null })} placeholder="mgl." type="text" />
      <div ref={wrapRef} style={s.ingNameWrap}>
        <input style={s.ingName} value={query} onChange={e => handleNameChange(e.target.value)} onFocus={() => suggestions.length > 0 && setShowDrop(true)} placeholder="Ingrediens…" autoComplete="off" />
        {showDrop && (
          <div style={s.dropdown}>
            {suggestions.map(sg => (
              <button key={sg.id} style={s.dropItem} onMouseDown={e => { e.preventDefault(); selectSuggestion(sg); }}>
                <span>{sg.name}</span>
                {sg.category_name && <span style={s.dropCat}>{sg.category_name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <button style={s.ingRemove} onClick={onRemove} title="Fjern">✕</button>
    </div>
  );
}

// ─── CatalogModal — ask user to save new ingredients to catalog ───────────────

interface CatalogEntry {
  name: string;
  quantity: string | null;
  category_id: string | null;
}

function CatalogModal({ entries, onDone }: {
  entries: CatalogEntry[];
  onDone: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(entries.map(e => [e.name, e.category_id]))
  );
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiGet<Category[]>('/api/ingredients/categories').then(setCategories).catch(() => null);
  }, []);

  const saveAll = async () => {
    setSaving(true);
    for (const entry of entries) {
      await apiPost('/api/ingredients', {
        name: entry.name,
        category_id: categoryMap[entry.name] || null,
        default_quantity: entry.quantity || null,
      }).catch(() => null);
    }
    setSaving(false);
    setDone(true);
    setTimeout(onDone, 800);
  };

  return (
    <div style={s.overlay} onClick={e => e.stopPropagation()}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <h2 style={s.title}>Gem til katalog?</h2>
        </div>
        <div style={s.body}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
            {entries.length === 1
              ? 'Denne ingrediens er ikke i kataloget endnu.'
              : `${entries.length} ingredienser er ikke i kataloget endnu.`}
            {' '}Vælg kategori og gem dem.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {entries.map(entry => (
              <div key={entry.name} style={s.catalogRow}>
                <span style={s.catalogName}>{entry.name}</span>
                <select
                  style={s.catalogSelect}
                  value={categoryMap[entry.name] ?? ''}
                  onChange={e => setCategoryMap(prev => ({ ...prev, [entry.name]: e.target.value || null }))}
                >
                  <option value="">Uden kategori</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div style={s.footer}>
          <button style={s.btnSecondary} onClick={onDone} disabled={saving}>Spring over</button>
          <button
            style={{ ...s.btnPrimary, opacity: saving || done ? 0.7 : 1 }}
            onClick={saveAll}
            disabled={saving || done}
          >
            {done ? '✓ Gemt' : saving ? 'Gemmer…' : `Gem ${entries.length === 1 ? 'ingrediens' : `${entries.length} ingredienser`}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RecipeForm — shared between create and edit ──────────────────────────────

export function RecipeForm({ recipe, initialTitle = '', onSaved, onCancel }: RecipeFormProps) {
  const isEdit = Boolean(recipe);
  const TMP_ID = recipe?.id ?? 'new';

  const [title, setTitle] = useState(recipe?.title ?? initialTitle);
  const [url, setUrl] = useState(recipe?.url ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 4));
  const [prepMinutes, setPrepMinutes] = useState(recipe?.prep_minutes != null ? String(recipe.prep_minutes) : '');
  const [tags, setTags] = useState<string[]>(parseTags(recipe?.tags ?? '[]'));
  const [rating, setRating] = useState(recipe?.rating ?? 0);
  const [ingredientTab, setIngredientTab] = useState<'text' | 'list'>('text');
  const [ingredientsText, setIngredientsText] = useState(ingredientsToText(recipe?.ingredients ?? []));
  const [editIngredients, setEditIngredients] = useState<RecipeIngredient[]>(recipe?.ingredients ?? []);
  const [instructions, setInstructions] = useState(recipe?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[] | null>(null);
  const savedRecipeRef = useRef<RecipeData | null>(null);
  const savedIngsRef = useRef<RecipeIngredient[]>([]);

  function switchTab(tab: 'text' | 'list') {
    if (tab === ingredientTab) return;
    if (tab === 'list') setEditIngredients(textToIngredients(ingredientsText, TMP_ID));
    else setIngredientsText(ingredientsToText(editIngredients));
    setIngredientTab(tab);
  }

  function getIngredients(recipeId: string): RecipeIngredient[] {
    const raw = ingredientTab === 'list' ? editIngredients : textToIngredients(ingredientsText, recipeId);
    return raw.map((ing, idx) => ({ ...ing, recipe_id: recipeId, sort_order: idx }));
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const tagsArr = tags;
      const body = {
        title: title.trim(),
        description: instructions.trim() || null,
        url: url.trim() || null,
        servings: Number(servings) || 4,
        prep_minutes: prepMinutes ? Number(prepMinutes) : null,
        tags: tagsArr,
        rating,
      };
      const saved = isEdit
        ? await apiPut<RecipeData>(`/api/recipes/${recipe!.id}`, body)
        : await apiPost<RecipeData>('/api/recipes', body);
      const ings = getIngredients(saved.id);
      await apiPut(`/api/recipes/${saved.id}/ingredients`, ings);

      // For ingredients without a catalog link, do an exact-match lookup to check
      // if they already exist in the catalog (e.g. typed manually without picking from dropdown).
      // Strip any leading quantity prefix from the name before looking up (e.g. "3 løg" → "løg").
      const unlinked = ings.filter(i => !i.ingredient_id && i.name.trim());
      const trulyNew: typeof unlinked = [];
      for (const ing of unlinked) {
        const rawName = ing.name.trim();
        const stripped = rawName.replace(QTY_RE, '$2').trim();
        const lookupName = stripped || rawName;
        const matches = await apiGet<Ingredient[]>(`/api/ingredients?q=${encodeURIComponent(lookupName)}`).catch(() => []);
        const exact = matches.find(m => m.name.toLowerCase() === lookupName.toLowerCase());
        if (exact) {
          // Link ingredient to catalog entry so it gets the right category
          ing.ingredient_id = exact.id;
          ing.category_id = exact.category_id;
          ing.name = exact.name;
        } else {
          trulyNew.push({ ...ing, name: lookupName });
        }
      }

      if (trulyNew.length > 0) {
        savedRecipeRef.current = saved;
        savedIngsRef.current = ings;
        setCatalogEntries(trulyNew.map(i => ({ name: i.name, quantity: i.quantity, category_id: i.category_id })));
        setSaving(false);
      } else {
        onSaved({ ...saved, ingredients: ings });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl');
      setSaving(false);
    }
  }

  return (
    <>
      {catalogEntries && (
        <CatalogModal
          entries={catalogEntries}
          onDone={() => {
            setCatalogEntries(null);
            onSaved({ ...savedRecipeRef.current!, ingredients: savedIngsRef.current });
          }}
        />
      )}
      <div style={s.body}>
        {!isEdit && (
          <>
            <label style={s.label}>Navn *</label>
            <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Opskriftens navn" />
          </>
        )}

        <label style={s.label}>Link til opskrift</label>
        <input style={s.input} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />

        <label style={s.label}>Tags</label>
        <TagInput tags={tags} onChange={setTags} />

        <div style={s.starRow}>
          <label style={s.label}>Bedømmelse</label>
          <div style={s.stars}>
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button" style={s.starBtn} onClick={() => setRating(rating === n ? 0 : n)}>
                <span style={{ color: n <= rating ? '#f59e0b' : '#d1d5db', fontSize: 24 }}>★</span>
              </button>
            ))}
          </div>
        </div>

        <div style={s.tabHeader}>
          <label style={s.label}>Ingredienser</label>
          <div style={s.tabs}>
            <button type="button" style={{ ...s.tabBtn, ...(ingredientTab === 'text' ? s.tabBtnActive : {}) }} onClick={() => switchTab('text')}>Tekst</button>
            <button type="button" style={{ ...s.tabBtn, ...(ingredientTab === 'list' ? s.tabBtnActive : {}) }} onClick={() => switchTab('list')}>Liste</button>
          </div>
        </div>

        {ingredientTab === 'text' ? (
          <textarea
            style={{ ...s.input, ...s.textarea }}
            value={ingredientsText}
            onChange={e => setIngredientsText(e.target.value)}
            rows={6}
            placeholder={"500g torskefilet\n2 fed hvidløg\n1 dl fløde\n…"}
          />
        ) : (
          <div style={s.ingList}>
            {editIngredients.map((ing, idx) => (
              <IngredientRow
                key={ing.id}
                ing={ing}
                onChange={u => setEditIngredients(prev => prev.map((x, i) => i === idx ? u : x))}
                onRemove={() => setEditIngredients(prev => prev.filter((_, i) => i !== idx))}
              />
            ))}
            <button type="button" style={s.addIngBtn} onClick={() => setEditIngredients(prev => [...prev, { id: crypto.randomUUID(), recipe_id: TMP_ID, ingredient_id: null, name: '', quantity: null, category_id: null, sort_order: prev.length }])}>
              + Tilføj ingrediens
            </button>
          </div>
        )}

        <label style={s.label}>Fremgangsmåde</label>
        <textarea
          style={{ ...s.input, ...s.textarea }}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={5}
          placeholder="Beskriv fremgangsmåden…"
        />

        {error && <p style={s.error}>{error}</p>}
      </div>

      <div style={s.footer}>
        <button style={s.btnSecondary} onClick={onCancel}>{isEdit ? 'Annuller' : 'Annuller'}</button>
        <button
          style={{ ...s.btnPrimary, opacity: saving || !title.trim() ? 0.5 : 1 }}
          onClick={handleSave}
          disabled={saving || !title.trim()}
        >
          {saving ? (isEdit ? 'Gemmer…' : 'Opretter…') : (isEdit ? 'Gem' : 'Opret')}
        </button>
      </div>
    </>
  );
}

// ─── CreateRecipeModal ────────────────────────────────────────────────────────

export default function CreateRecipeModal({ initialTitle = '', onCreated, onClose }: CreateRecipeModalProps) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <h2 style={s.title}>Ny opskrift</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <RecipeForm initialTitle={initialTitle} onSaved={onCreated} onCancel={onClose} />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 300,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modal: {
    background: 'var(--bg-card, #fff)',
    borderRadius: '20px 20px 0 0',
    width: '100%',
    maxWidth: 640,
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--border, #e0e0e0)',
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary, #1a1a1a)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, color: 'var(--text-secondary, #999)', cursor: 'pointer', padding: 4 },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  footer: {
    display: 'flex',
    gap: 10,
    padding: '12px 20px max(12px, env(safe-area-inset-bottom))',
    borderTop: '1px solid var(--border, #e0e0e0)',
    flexShrink: 0,
  },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary, #444)', marginBottom: -4 },
  hint: { fontWeight: 400, color: '#999' },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 16,
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box' as const,
    background: 'var(--bg-primary, #fafafa)',
    color: 'var(--text-primary, #1a1a1a)',
    fontFamily: 'inherit',
  },
  textarea: { resize: 'vertical' as const, lineHeight: 1.5 },
  row2: { display: 'flex', gap: 10 },
  tabHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  tabs: { display: 'flex', border: '1px solid var(--border, #e0e0e0)', borderRadius: 8, overflow: 'hidden' },
  tabBtn: { padding: '5px 14px', fontSize: 13, background: 'var(--bg-primary, #fafafa)', color: 'var(--text-secondary, #666)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  tabBtnActive: { background: 'var(--accent, #1976D2)', color: '#fff' },
  ingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8,
    padding: 8,
    background: 'var(--bg-primary, #fafafa)',
  },
  ingRow: { display: 'flex', gap: 6, alignItems: 'center' },
  ingQty: { width: 72, padding: '8px', fontSize: 14, border: '1px solid var(--border, #e0e0e0)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #1a1a1a)', flexShrink: 0, boxSizing: 'border-box' as const },
  ingNameWrap: { flex: 1, position: 'relative', minWidth: 0 },
  ingName: { width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--border, #e0e0e0)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' as const },
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e0e0e0)', borderRadius: 8, zIndex: 400, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' as const },
  dropItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 12px', fontSize: 14, background: 'none', border: 'none', borderBottom: '1px solid var(--border, #e0e0e0)', cursor: 'pointer', textAlign: 'left' as const, color: 'var(--text-primary, #1a1a1a)', fontFamily: 'inherit' },
  dropCat: { fontSize: 12, color: 'var(--text-secondary, #999)', marginLeft: 8, flexShrink: 0 },
  ingRemove: { background: 'none', border: 'none', color: 'var(--text-secondary, #999)', fontSize: 16, cursor: 'pointer', padding: '4px 6px', flexShrink: 0 },
  addIngBtn: { background: 'none', border: '1px dashed var(--border, #e0e0e0)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--accent, #1976D2)', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit' },
  starRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  stars: { display: 'flex', gap: 2 },
  starBtn: { background: 'none', border: 'none', padding: '2px', cursor: 'pointer', lineHeight: 1 },
  error: { color: '#e53935', fontSize: 13, margin: '2px 0 0' },
  catalogRow: { display: 'flex', alignItems: 'center', gap: 10 },
  catalogName: { flex: 1, fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  catalogSelect: { flexShrink: 0, padding: '8px 10px', fontSize: 14, border: '1px solid var(--border, #e0e0e0)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', maxWidth: 180 },
  btnPrimary: { flex: 1, padding: '13px 0', background: 'var(--accent, #1976D2)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { flex: 1, padding: '13px 0', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
};
