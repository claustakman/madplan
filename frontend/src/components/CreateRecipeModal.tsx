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

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function ingredientsToText(ings: RecipeIngredient[]): string {
  return ings.map(i => i.quantity ? `${i.quantity} ${i.name}` : i.name).join('\n');
}

export function textToIngredients(text: string, recipeId: string): RecipeIngredient[] {
  return text.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return { id: crypto.randomUUID(), recipe_id: recipeId, ingredient_id: null, name: trimmed, quantity: null, category_id: null, sort_order: idx };
  }).filter(Boolean) as RecipeIngredient[];
}

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

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

// ─── RecipeForm — shared between create and edit ──────────────────────────────

export function RecipeForm({ recipe, initialTitle = '', onSaved, onCancel }: RecipeFormProps) {
  const isEdit = Boolean(recipe);
  const TMP_ID = recipe?.id ?? 'new';

  const [title, setTitle] = useState(recipe?.title ?? initialTitle);
  const [url, setUrl] = useState(recipe?.url ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 4));
  const [prepMinutes, setPrepMinutes] = useState(recipe?.prep_minutes != null ? String(recipe.prep_minutes) : '');
  const [tagInput, setTagInput] = useState(parseTags(recipe?.tags ?? '[]').join(', '));
  const [ingredientTab, setIngredientTab] = useState<'text' | 'list'>('text');
  const [ingredientsText, setIngredientsText] = useState(ingredientsToText(recipe?.ingredients ?? []));
  const [editIngredients, setEditIngredients] = useState<RecipeIngredient[]>(recipe?.ingredients ?? []);
  const [instructions, setInstructions] = useState(recipe?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      const tagsArr = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const body = {
        title: title.trim(),
        description: instructions.trim() || null,
        url: url.trim() || null,
        servings: Number(servings) || 4,
        prep_minutes: prepMinutes ? Number(prepMinutes) : null,
        tags: tagsArr,
      };
      const saved = isEdit
        ? await apiPut<RecipeData>(`/api/recipes/${recipe!.id}`, body)
        : await apiPost<RecipeData>('/api/recipes', body);
      const ings = getIngredients(saved.id);
      await apiPut(`/api/recipes/${saved.id}/ingredients`, ings);
      onSaved({ ...saved, ingredients: ings });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl');
      setSaving(false);
    }
  }

  return (
    <>
      <div style={s.body}>
        {!isEdit && (
          <>
            <label style={s.label}>Navn *</label>
            <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Opskriftens navn" />
          </>
        )}

        <label style={s.label}>Link til opskrift</label>
        <input style={s.input} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />

        <div style={s.row2}>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Portioner</label>
            <input style={s.input} type="number" min={1} value={servings} onChange={e => setServings(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Tid (min)</label>
            <input style={s.input} type="number" min={0} value={prepMinutes} onChange={e => setPrepMinutes(e.target.value)} placeholder="—" />
          </div>
        </div>

        <label style={s.label}>Tags <span style={s.hint}>(kommaseparerede)</span></label>
        <input style={s.input} value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="vegetar, hurtig, pasta…" />

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
  error: { color: '#e53935', fontSize: 13, margin: '2px 0 0' },
  btnPrimary: { flex: 1, padding: '13px 0', background: 'var(--accent, #1976D2)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { flex: 1, padding: '13px 0', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
};
