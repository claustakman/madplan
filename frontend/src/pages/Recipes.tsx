import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  servings: number;
  prep_minutes: number | null;
  tags: string; // JSON string in DB
  created_by: string;
  created_at: string;
  ingredients?: RecipeIngredient[];
}

interface RecipeIngredient {
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
  times_bought: number;
  default_quantity: string | null;
  default_store: string | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

// ── Convert between text and structured ingredients ───────────────────────────

function ingredientsToText(ings: RecipeIngredient[]): string {
  return ings.map(i => i.quantity ? `${i.quantity} ${i.name}` : i.name).join('\n');
}

function textToIngredients(text: string, recipeId: string): RecipeIngredient[] {
  return text.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return {
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      ingredient_id: null,
      name: trimmed,
      quantity: null,
      category_id: null,
      sort_order: idx,
    };
  }).filter(Boolean) as RecipeIngredient[];
}

// ── IngredientRow — one row in the "Liste" tab ────────────────────────────────

interface IngredientRowProps {
  ing: RecipeIngredient;
  onChange: (updated: RecipeIngredient) => void;
  onRemove: () => void;
}

function IngredientRow({ ing, onChange, onRemove }: IngredientRowProps) {
  const [query, setQuery] = useState(ing.name);
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
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

  function selectSuggestion(s: Ingredient) {
    setQuery(s.name);
    setShowDrop(false);
    setSuggestions([]);
    onChange({
      ...ing,
      name: s.name,
      ingredient_id: s.id,
      category_id: s.category_id,
      quantity: ing.quantity ?? s.default_quantity,
    });
  }

  return (
    <div style={styles.ingEditRow}>
      <input
        style={styles.ingQtyInput}
        value={ing.quantity ?? ''}
        onChange={e => onChange({ ...ing, quantity: e.target.value || null })}
        placeholder="mgl."
        type="text"
      />
      <div ref={wrapRef} style={styles.ingNameWrap}>
        <input
          style={styles.ingNameInput}
          value={query}
          onChange={e => handleNameChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDrop(true)}
          placeholder="Ingrediens…"
          autoComplete="off"
        />
        {showDrop && (
          <div style={styles.dropdown}>
            {suggestions.map(s => (
              <button
                key={s.id}
                style={styles.dropdownItem}
                onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
              >
                <span>{s.name}</span>
                {s.category_name && <span style={styles.dropCat}>{s.category_name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <button style={styles.ingRemoveBtn} onClick={onRemove} title="Fjern">✕</button>
    </div>
  );
}

// ── Recipe list card ──────────────────────────────────────────────────────────

function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const tags = parseTags(recipe.tags);
  return (
    <button style={styles.card} onClick={onOpen}>
      <div style={styles.cardBody}>
        <span style={styles.cardTitle}>{recipe.title}</span>
        <div style={styles.cardMeta}>
          {recipe.prep_minutes != null && (
            <span style={styles.metaChip}>⏱ {recipe.prep_minutes} min</span>
          )}
          {recipe.servings && (
            <span style={styles.metaChip}>👤 {recipe.servings}</span>
          )}
          {recipe.url && (
            <span style={styles.metaChip}>🔗 Link</span>
          )}
        </div>
        {tags.length > 0 && (
          <div style={styles.tagRow}>
            {tags.map(t => <span key={t} style={styles.tag}>{t}</span>)}
          </div>
        )}
      </div>
      <span style={styles.cardArrow}>›</span>
    </button>
  );
}

// ── Detail / edit modal ───────────────────────────────────────────────────────

interface DetailModalProps {
  recipe: Recipe;
  categories: Category[];
  onClose: () => void;
  onSaved: (r: Recipe) => void;
  onDeleted: (id: string) => void;
}

function DetailModal({ recipe, categories: _categories, onClose, onSaved, onDeleted }: DetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartDone, setCartDone] = useState(false);

  // edit fields
  const [title, setTitle] = useState(recipe.title);
  const [ingredientsText, setIngredientsText] = useState(
    ingredientsToText(recipe.ingredients ?? [])
  );
  const [editIngredients, setEditIngredients] = useState<RecipeIngredient[]>(
    recipe.ingredients ?? []
  );
  const [ingredientTab, setIngredientTab] = useState<'text' | 'list'>('text');
  const [instructions, setInstructions] = useState(recipe.description ?? '');
  const [url, setUrl] = useState(recipe.url ?? '');
  const [servings, setServings] = useState(String(recipe.servings ?? 4));
  const [prepMinutes, setPrepMinutes] = useState(recipe.prep_minutes != null ? String(recipe.prep_minutes) : '');
  const [tagInput, setTagInput] = useState(parseTags(recipe.tags).join(', '));

  const tags = parseTags(recipe.tags);

  function switchTab(tab: 'text' | 'list') {
    if (tab === ingredientTab) return;
    if (tab === 'list') {
      // Convert text → list
      setEditIngredients(textToIngredients(ingredientsText, recipe.id));
    } else {
      // Convert list → text
      setIngredientsText(ingredientsToText(editIngredients));
    }
    setIngredientTab(tab);
  }

  function getIngredientsForSave(): RecipeIngredient[] {
    if (ingredientTab === 'list') return editIngredients;
    return textToIngredients(ingredientsText, recipe.id);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const tagsArr = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const updated = await apiPut<Recipe>(`/api/recipes/${recipe.id}`, {
        title: title.trim(),
        description: instructions.trim() || null,
        url: url.trim() || null,
        servings: Number(servings) || 4,
        prep_minutes: prepMinutes ? Number(prepMinutes) : null,
        tags: tagsArr,
      });
      const newIngredients = getIngredientsForSave();
      await apiPut(`/api/recipes/${recipe.id}/ingredients`, newIngredients);
      onSaved({ ...updated, ingredients: newIngredients });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await apiDelete(`/api/recipes/${recipe.id}`);
    onDeleted(recipe.id);
  }

  async function addAllToShopping() {
    const ings = recipe.ingredients ?? [];
    if (ings.length === 0) return;
    setAddingToCart(true);
    try {
      for (const ing of ings) {
        await apiPost('/api/shopping', {
          name: ing.name,
          category_id: ing.category_id ?? null,
          quantity: ing.quantity ?? null,
        });
      }
      setCartDone(true);
      setTimeout(() => setCartDone(false), 2500);
    } finally {
      setAddingToCart(false);
    }
  }

  function updateIngredient(idx: number, updated: RecipeIngredient) {
    setEditIngredients(prev => prev.map((ing, i) => i === idx ? updated : ing));
  }

  function removeIngredient(idx: number) {
    setEditIngredients(prev => prev.filter((_, i) => i !== idx));
  }

  function addIngredient() {
    setEditIngredients(prev => [...prev, {
      id: crypto.randomUUID(),
      recipe_id: recipe.id,
      ingredient_id: null,
      name: '',
      quantity: null,
      category_id: null,
      sort_order: prev.length,
    }]);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          {editing ? (
            <input
              style={styles.titleInput}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Opskriftens navn"
              autoFocus
            />
          ) : (
            <h2 style={styles.modalTitle}>{recipe.title}</h2>
          )}
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          {editing ? (
            <div style={styles.editForm}>
              <label style={styles.label}>Link til opskrift</label>
              <input
                style={styles.input}
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://…"
              />

              <div style={styles.row2}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Portioner</label>
                  <input
                    style={styles.input}
                    type="number"
                    min={1}
                    value={servings}
                    onChange={e => setServings(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Tid (minutter)</label>
                  <input
                    style={styles.input}
                    type="number"
                    min={0}
                    value={prepMinutes}
                    onChange={e => setPrepMinutes(e.target.value)}
                    placeholder="—"
                  />
                </div>
              </div>

              <label style={styles.label}>Tags <span style={styles.hint}>(kommaseparerede)</span></label>
              <input
                style={styles.input}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="vegetar, hurtig, pasta…"
              />

              {/* Ingredienser with tabs */}
              <div>
                <div style={styles.tabHeader}>
                  <span style={styles.label}>Ingredienser</span>
                  <div style={styles.tabs}>
                    <button
                      style={{ ...styles.tabBtn, ...(ingredientTab === 'text' ? styles.tabBtnActive : {}) }}
                      onClick={() => switchTab('text')}
                      type="button"
                    >
                      Tekst
                    </button>
                    <button
                      style={{ ...styles.tabBtn, ...(ingredientTab === 'list' ? styles.tabBtnActive : {}) }}
                      onClick={() => switchTab('list')}
                      type="button"
                    >
                      Liste
                    </button>
                  </div>
                </div>

                {ingredientTab === 'text' ? (
                  <textarea
                    style={{ ...styles.textarea, minHeight: 120 }}
                    value={ingredientsText}
                    onChange={e => setIngredientsText(e.target.value)}
                    rows={6}
                    placeholder={"500g torskefilet\n2 fed hvidløg\n1 dl fløde\n…"}
                  />
                ) : (
                  <div style={styles.ingListEdit}>
                    {editIngredients.map((ing, idx) => (
                      <IngredientRow
                        key={ing.id}
                        ing={ing}
                        onChange={updated => updateIngredient(idx, updated)}
                        onRemove={() => removeIngredient(idx)}
                      />
                    ))}
                    <button style={styles.addIngBtn} onClick={addIngredient} type="button">
                      + Tilføj ingrediens
                    </button>
                  </div>
                )}
              </div>

              <label style={styles.label}>Fremgangsmåde</label>
              <textarea
                style={{ ...styles.textarea, minHeight: 160 }}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                rows={8}
                placeholder="Beskriv fremgangsmåden trin for trin…"
              />
            </div>
          ) : (
            <div style={styles.viewBody}>
              <div style={styles.viewMeta}>
                {recipe.prep_minutes != null && (
                  <div style={styles.metaItem}><span style={styles.metaLabel}>Tid</span><span>{recipe.prep_minutes} min</span></div>
                )}
                <div style={styles.metaItem}><span style={styles.metaLabel}>Portioner</span><span>{recipe.servings}</span></div>
              </div>

              {recipe.url && (
                <a
                  href={recipe.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.recipeLink}
                  onClick={e => e.stopPropagation()}
                >
                  🔗 Åbn opskrift
                </a>
              )}

              {tags.length > 0 && (
                <div style={styles.tagRow}>
                  {tags.map(t => <span key={t} style={styles.tag}>{t}</span>)}
                </div>
              )}

              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div style={styles.ingSection}>
                  <div style={styles.ingHeaderRow}>
                    <h3 style={styles.ingHeader}>Ingredienser</h3>
                    <button
                      style={cartDone ? styles.cartBtnDone : styles.cartBtn}
                      onClick={addAllToShopping}
                      disabled={addingToCart}
                    >
                      {cartDone ? '✓ Tilføjet' : addingToCart ? 'Tilføjer…' : '🛒 Tilføj alle til indkøbsliste'}
                    </button>
                  </div>
                  {recipe.ingredients.map(ing => (
                    <div key={ing.id} style={styles.ingViewRow}>
                      {ing.quantity && <span style={styles.ingQty}>{ing.quantity}</span>}
                      <span>{ing.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {recipe.description && (
                <div style={styles.ingSection}>
                  <h3 style={styles.ingHeader}>Fremgangsmåde</h3>
                  <p style={styles.instructionsText}>{recipe.description}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          {editing ? (
            <>
              <button style={styles.btnSecondary} onClick={() => setEditing(false)} disabled={saving}>Annuller</button>
              <button style={styles.btnPrimary} onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? 'Gemmer…' : 'Gem'}
              </button>
            </>
          ) : (
            <>
              {confirmDelete ? (
                <>
                  <span style={styles.confirmText}>Slet opskrift?</span>
                  <button style={styles.btnSecondary} onClick={() => setConfirmDelete(false)}>Nej</button>
                  <button style={styles.btnDanger} onClick={handleDelete}>Slet</button>
                </>
              ) : (
                <>
                  <button style={styles.btnDanger} onClick={() => setConfirmDelete(true)}>Slet</button>
                  <button style={styles.btnPrimary} onClick={() => setEditing(true)}>Rediger</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (r: Recipe) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [servings, setServings] = useState('4');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const tagsArr = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const recipe = await apiPost<Recipe>('/api/recipes', {
        title: title.trim(),
        url: url.trim() || null,
        servings: Number(servings) || 4,
        prep_minutes: prepMinutes ? Number(prepMinutes) : null,
        tags: tagsArr,
      });
      onCreated(recipe);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Ny opskrift</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.editForm}>
            <label style={styles.label}>Navn *</label>
            <input
              style={styles.input}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Opskriftens navn"
              autoFocus
            />

            <label style={styles.label}>Link til opskrift</label>
            <input
              style={styles.input}
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
            />

            <div style={styles.row2}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Portioner</label>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  value={servings}
                  onChange={e => setServings(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Tid (min)</label>
                <input
                  style={styles.input}
                  type="number"
                  min={0}
                  value={prepMinutes}
                  onChange={e => setPrepMinutes(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>

            <label style={styles.label}>Tags <span style={styles.hint}>(kommaseparerede)</span></label>
            <input
              style={styles.input}
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="vegetar, hurtig, pasta…"
            />

            {error && <p style={styles.errorText}>{error}</p>}
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.btnSecondary} onClick={onClose}>Annuller</button>
          <button style={styles.btnPrimary} onClick={handleCreate} disabled={saving || !title.trim()}>
            {saving ? 'Opretter…' : 'Opret'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRecipes(q?: string, tag?: string | null) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tag) params.set('tags', tag);
    const path = '/api/recipes' + (params.size ? '?' + params.toString() : '');
    const data = await apiGet<Recipe[]>(path);
    setRecipes(data);
  }

  useEffect(() => {
    loadRecipes().finally(() => setLoading(false));
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => loadRecipes(val, activeTag), 300);
  }

  function handleTagClick(tag: string) {
    const next = activeTag === tag ? null : tag;
    setActiveTag(next);
    loadRecipes(search, next);
  }

  async function openRecipe(recipe: Recipe) {
    const full = await apiGet<Recipe>(`/api/recipes/${recipe.id}`);
    setSelected(full);
  }

  function handleCreated(r: Recipe) {
    setRecipes(prev => [r, ...prev]);
    setShowCreate(false);
    setSelected({ ...r, ingredients: [] });
  }

  function handleSaved(r: Recipe) {
    setRecipes(prev => prev.map(x => x.id === r.id ? r : x));
    setSelected(r);
  }

  function handleDeleted(id: string) {
    setRecipes(prev => prev.filter(x => x.id !== id));
    setSelected(null);
  }

  const allTags = Array.from(new Set(recipes.flatMap(r => parseTags(r.tags)))).sort();

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.heading}>Opskrifter</h1>
        <button style={styles.fabSmall} onClick={() => setShowCreate(true)}>＋</button>
      </div>

      {/* Search + filter row */}
      <div style={styles.searchRow}>
        <input
          style={styles.searchInput}
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Søg opskrifter…"
          type="search"
        />
        {allTags.length > 0 && (
          <button
            style={{ ...styles.filterBtn, ...(activeTag ? styles.filterBtnActive : {}) }}
            onClick={() => setFilterOpen(o => !o)}
          >
            {activeTag ? `🏷 ${activeTag}` : '🏷 Filtrer'}
            <span style={styles.filterChevron}>{filterOpen ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {/* Tag filter pills — collapsible */}
      {filterOpen && allTags.length > 0 && (
        <div style={styles.tagFilter}>
          {activeTag && (
            <button
              style={styles.tagPillClear}
              onClick={() => { setActiveTag(null); loadRecipes(search, null); }}
            >
              ✕ Ryd filter
            </button>
          )}
          {allTags.map(tag => (
            <button
              key={tag}
              style={{ ...styles.tagPill, ...(activeTag === tag ? styles.tagPillActive : {}) }}
              onClick={() => { handleTagClick(tag); setFilterOpen(false); }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={styles.empty}>Indlæser…</div>
      ) : recipes.length === 0 ? (
        <div style={styles.empty}>
          {search || activeTag ? 'Ingen opskrifter matcher søgningen' : 'Ingen opskrifter endnu — tilføj din første!'}
        </div>
      ) : (
        <div style={styles.list}>
          {recipes.map(r => (
            <RecipeCard key={r.id} recipe={r} onOpen={() => openRecipe(r)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <DetailModal
          recipe={selected}
          categories={[]}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '0 0 32px',
    maxWidth: 640,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 16px 8px',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  fabSmall: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 24,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  searchRow: {
    padding: '0 16px 12px',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    padding: '10px 14px',
    fontSize: 16,
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  filterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  filterBtnActive: {
    background: '#e3f0fc',
    color: '#1565C0',
    borderColor: 'var(--accent)',
  },
  filterChevron: {
    fontSize: 10,
    opacity: 0.6,
    flexShrink: 0,
  },
  tagFilter: {
    display: 'flex',
    gap: 8,
    padding: '0 16px 12px',
    overflowX: 'auto' as const,
    flexWrap: 'wrap' as const,
  },
  tagPill: {
    padding: '6px 12px',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  tagPillActive: {
    background: 'var(--accent)',
    color: '#fff',
    borderColor: 'var(--accent)',
  },
  tagPillClear: {
    padding: '6px 12px',
    borderRadius: 20,
    border: '1px solid var(--danger)',
    background: 'none',
    color: 'var(--danger)',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '0 16px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    gap: 8,
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  cardDesc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardMeta: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  cardArrow: {
    fontSize: 20,
    color: 'var(--border)',
    flexShrink: 0,
  },
  tagRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  tag: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
    background: '#e3f0fc',
    color: '#1565C0',
  },
  empty: {
    padding: '40px 16px',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: 15,
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 300,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modal: {
    width: '100%',
    maxWidth: 600,
    background: 'var(--bg-card)',
    borderRadius: '20px 20px 0 0',
    maxHeight: '90dvh',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '20px 20px 0',
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  titleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: 700,
    border: 'none',
    borderBottom: '2px solid var(--accent)',
    padding: '2px 0',
    background: 'transparent',
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
    flexShrink: 0,
  },
  modalBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  },
  modalFooter: {
    padding: '12px 20px calc(12px + env(safe-area-inset-bottom))',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  // Edit form
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: -6,
  },
  hint: {
    fontWeight: 400,
    fontSize: 12,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 16,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 15,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  row2: {
    display: 'flex',
    gap: 12,
  },
  // Tab header for ingredienser
  tabHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tabs: {
    display: 'flex',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tabBtn: {
    padding: '5px 14px',
    fontSize: 13,
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabBtnActive: {
    background: 'var(--accent)',
    color: '#fff',
  },
  // Ingredient list edit
  ingListEdit: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 8,
    background: 'var(--bg-primary)',
  },
  ingEditRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  ingQtyInput: {
    width: 72,
    padding: '8px 8px',
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  ingNameWrap: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
  },
  ingNameInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    zIndex: 400,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    maxHeight: 200,
    overflowY: 'auto',
  },
  dropdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
  },
  dropCat: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginLeft: 8,
    flexShrink: 0,
  },
  ingRemoveBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 14,
    padding: '4px 6px',
    flexShrink: 0,
    lineHeight: 1,
  },
  addIngBtn: {
    background: 'none',
    border: '1px dashed var(--border)',
    borderRadius: 6,
    padding: '8px',
    color: 'var(--accent)',
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
    marginTop: 2,
  },
  errorText: {
    color: 'var(--danger)',
    fontSize: 14,
    margin: 0,
  },
  // View body
  viewBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  viewMeta: {
    display: 'flex',
    gap: 20,
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recipeLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    alignSelf: 'flex-start',
  },
  ingSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  ingHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ingHeader: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    margin: 0,
  },
  cartBtn: {
    padding: '6px 12px',
    fontSize: 13,
    background: '#e3f0fc',
    color: '#1565C0',
    border: '1px solid #b3d1f0',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  cartBtnDone: {
    padding: '6px 12px',
    fontSize: 13,
    background: '#e8f5e9',
    color: '#2e7d32',
    border: '1px solid #a5d6a7',
    borderRadius: 8,
    cursor: 'default',
    fontFamily: 'inherit',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  ingViewRow: {
    display: 'flex',
    gap: 10,
    fontSize: 15,
    alignItems: 'baseline',
  },
  instructionsText: {
    fontSize: 15,
    lineHeight: 1.65,
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    margin: 0,
  },
  ingQty: {
    color: 'var(--text-secondary)',
    fontSize: 14,
    minWidth: 60,
  },
  // Buttons
  btnPrimary: {
    flex: 1,
    padding: '12px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    flex: 1,
    padding: '12px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    fontSize: 16,
    cursor: 'pointer',
  },
  btnDanger: {
    flex: 1,
    padding: '12px',
    background: 'none',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    borderRadius: 10,
    fontSize: 16,
    cursor: 'pointer',
  },
  confirmText: {
    flex: 1,
    fontSize: 14,
    color: 'var(--text-secondary)',
  },
};
