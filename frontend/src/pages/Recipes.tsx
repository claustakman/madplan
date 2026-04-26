import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import CreateRecipeModal, { RecipeForm, RecipeData, RecipeIngredient } from '../components/CreateRecipeModal';

// ── AI generate modal ─────────────────────────────────────────────────────────

interface AISuggestion {
  title: string;
  description: string;
  tags: string[];
  prep_minutes: number | null;
  servings: number;
  ingredients: Array<{ name: string; quantity: string }>;
  url: string | null;
}

function AIRecipeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: RecipeData) => void }) {
  const [prompt, setPrompt] = useState('');
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<'input' | 'loading' | 'form'>('input');
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const generate = async () => {
    if (!prompt.trim() && !url.trim()) return;
    setPhase('loading');
    setError('');
    try {
      const result = await apiPost<AISuggestion>('/api/ai/generate-recipe', {
        prompt: prompt.trim() || 'Generer en opskrift fra denne URL',
        url: url.trim() || undefined,
      });
      setSuggestion(result);
      setPhase('form');
    } catch {
      setError('Noget gik galt — prøv igen.');
      setPhase('input');
    }
  };

  // Build a RecipeData-shaped object from the AI suggestion for RecipeForm
  const suggestionAsRecipe: RecipeData | undefined = suggestion ? {
    id: 'ai-draft',
    title: suggestion.title,
    description: suggestion.description,
    url: suggestion.url,
    servings: suggestion.servings,
    prep_minutes: suggestion.prep_minutes,
    tags: JSON.stringify(suggestion.tags),
    rating: 0,
    created_by: '',
    created_at: '',
    ingredients: suggestion.ingredients.map((ing, i) => ({
      id: crypto.randomUUID(),
      recipe_id: 'ai-draft',
      ingredient_id: null,
      name: ing.name,
      quantity: ing.quantity || null,
      category_id: null,
      sort_order: i,
    })),
  } : undefined;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {phase === 'form' ? suggestion?.title : '✨ Opret opskrift med AI'}
          </h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {phase === 'input' && (
          <>
            <div style={styles.modalBody}>
              <label style={aiS.label}>Beskriv hvad du vil lave</label>
              <textarea
                ref={inputRef}
                style={aiS.textarea}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="fx: en hurtig pasta med laks og fløde til 4 personer"
                rows={3}
              />
              <label style={aiS.label}>Link til opskrift <span style={aiS.opt}>(valgfrit)</span></label>
              <input
                style={aiS.input}
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://…"
              />
              {error && <p style={aiS.error}>{error}</p>}
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.btnSecondary} onClick={onClose}>Annuller</button>
              <button
                style={{ ...styles.btnPrimary, opacity: prompt.trim() || url.trim() ? 1 : 0.5 }}
                onClick={generate}
                disabled={!prompt.trim() && !url.trim()}
              >
                Generer ✨
              </button>
            </div>
          </>
        )}

        {phase === 'loading' && (
          <div style={aiS.loading}>
            <div style={aiS.spinner} />
            <p style={aiS.loadingText}>AI genererer opskrift…</p>
          </div>
        )}

        {phase === 'form' && suggestionAsRecipe && (
          <RecipeForm
            recipe={suggestionAsRecipe}
            onSaved={r => onCreated(r)}
            onCancel={() => setPhase('input')}
          />
        )}
      </div>
    </div>
  );
}

const aiS: Record<string, React.CSSProperties> = {
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: -4 },
  opt: { fontWeight: 400, color: '#bbb' },
  textarea: { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'none' as const },
  input: { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const, background: 'var(--bg-primary)', color: 'var(--text-primary)' },
  error: { color: 'var(--danger)', fontSize: 13, margin: 0 },
  loading: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 0' },
  spinner: { width: 40, height: 40, borderRadius: '50%', border: '3px solid #e3f0fc', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: 15, color: 'var(--text-secondary)', margin: 0 },
};

interface Recipe extends RecipeData {
  ingredients?: RecipeIngredient[];
}

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  if (!rating) return null;
  return (
    <span style={{ fontSize: size, letterSpacing: 1 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= rating ? '#f59e0b' : '#d1d5db' }}>★</span>
      ))}
    </span>
  );
}

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

// ── Recipe list card ──────────────────────────────────────────────────────────

function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const tags = parseTags(recipe.tags);
  return (
    <button style={styles.card} onClick={onOpen}>
      <div style={styles.cardBody}>
        <span style={styles.cardTitle}>{recipe.title}</span>
        {recipe.url && (
          <span style={styles.metaChip}>🔗 Link</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {recipe.rating > 0 && <StarDisplay rating={recipe.rating} />}
          {tags.length > 0 && tags.map(t => <span key={t} style={styles.tag}>{t}</span>)}
        </div>
      </div>
      <span style={styles.cardArrow}>›</span>
    </button>
  );
}

// ── Detail / edit modal ───────────────────────────────────────────────────────

interface DetailModalProps {
  recipe: Recipe;
  onClose: () => void;
  onSaved: (r: Recipe) => void;
  onDeleted: (id: string) => void;
}

function DetailModal({ recipe, onClose, onSaved, onDeleted }: DetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartDone, setCartDone] = useState(false);

  const tags = parseTags(recipe.tags);

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
        let categoryId = ing.category_id ?? null;
        // If no category linked, look up in catalog by name to get the right category
        if (!categoryId && ing.name?.trim()) {
          const matches = await apiGet<Array<{ id: string; name: string; category_id: string | null }>>(
            `/api/ingredients?q=${encodeURIComponent(ing.name.trim())}`
          ).catch(() => []);
          const exact = matches.find(m => m.name.toLowerCase() === ing.name.trim().toLowerCase());
          if (exact) categoryId = exact.category_id;
        }
        await apiPost('/api/shopping', {
          name: ing.name,
          category_id: categoryId,
          quantity: ing.quantity ?? null,
        });
      }
      setCartDone(true);
      setTimeout(() => setCartDone(false), 2500);
    } finally {
      setAddingToCart(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          {editing ? (
            <h2 style={styles.modalTitle}>{recipe.title}</h2>
          ) : (
            <h2 style={styles.modalTitle}>{recipe.title}</h2>
          )}
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {editing ? (
          <RecipeForm
            recipe={recipe}
            onSaved={r => { onSaved(r as Recipe); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div style={styles.modalBody}>
              <div style={styles.viewBody}>
                {recipe.rating > 0 && <StarDisplay rating={recipe.rating} size={22} />}

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
            </div>

            <div style={styles.modalFooter}>
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
            </div>
          </>
        )}
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
  const [minRating, setMinRating] = useState(0);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAIRecipe, setShowAIRecipe] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRecipes(q?: string, tag?: string | null, rating?: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tag) params.set('tags', tag);
    if (rating) params.set('min_rating', String(rating));
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
    searchRef.current = setTimeout(() => loadRecipes(val, activeTag, minRating), 300);
  }

  function handleTagClick(tag: string) {
    const next = activeTag === tag ? null : tag;
    setActiveTag(next);
    loadRecipes(search, next, minRating);
  }

  function handleRatingFilter(n: number) {
    const next = minRating === n ? 0 : n;
    setMinRating(next);
    loadRecipes(search, activeTag, next);
  }

  async function openRecipe(recipe: Recipe) {
    const full = await apiGet<Recipe>(`/api/recipes/${recipe.id}`);
    setSelected(full);
  }

  function handleCreated(r: RecipeData) {
    setRecipes(prev => [r as Recipe, ...prev]);
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.aiSmall} onClick={() => setShowAIRecipe(true)}>✨ AI</button>
          <button style={styles.fabSmall} onClick={() => setShowCreate(true)}>＋</button>
        </div>
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
            style={{ ...styles.filterBtn, ...((activeTag || minRating > 0) ? styles.filterBtnActive : {}) }}
            onClick={() => setFilterOpen(o => !o)}
          >
            {activeTag ? `🏷 ${activeTag}` : minRating > 0 ? `${'★'.repeat(minRating)}+` : '🏷 Filtrer'}
            <span style={styles.filterChevron}>{filterOpen ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {/* Filter panel — collapsible */}
      {filterOpen && (
        <div style={styles.filterPanel}>
          {/* Star filter */}
          <div style={styles.filterSection}>
            <span style={styles.filterLabel}>Minimum bedømmelse</span>
            <div style={styles.starFilterRow}>
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  style={{ ...styles.starFilterBtn, ...(minRating === n ? styles.starFilterBtnActive : {}) }}
                  onClick={() => handleRatingFilter(n)}
                >
                  {'★'.repeat(n)}
                </button>
              ))}
              {minRating > 0 && (
                <button style={styles.tagPillClear} onClick={() => handleRatingFilter(0)}>✕</button>
              )}
            </div>
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div style={styles.filterSection}>
              <span style={styles.filterLabel}>Tags</span>
              <div style={styles.tagFilter}>
                {activeTag && (
                  <button style={styles.tagPillClear} onClick={() => { setActiveTag(null); loadRecipes(search, null, minRating); }}>
                    ✕ Ryd
                  </button>
                )}
                {allTags.map(tag => (
                  <button
                    key={tag}
                    style={{ ...styles.tagPill, ...(activeTag === tag ? styles.tagPillActive : {}) }}
                    onClick={() => { handleTagClick(tag); }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {showCreate && (
        <CreateRecipeModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {showAIRecipe && (
        <AIRecipeModal
          onClose={() => setShowAIRecipe(false)}
          onCreated={r => { handleCreated(r); setShowAIRecipe(false); }}
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
  aiSmall: {
    height: 40,
    borderRadius: 20,
    background: '#f3e8ff',
    color: '#7c3aed',
    fontSize: 14,
    fontWeight: 700,
    border: '1px solid #d8b4fe',
    cursor: 'pointer',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
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
  filterPanel: {
    padding: '0 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  filterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  starFilterRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  starFilterBtn: {
    padding: '5px 10px',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: '#f59e0b',
    fontSize: 13,
    cursor: 'pointer',
    letterSpacing: 1,
  },
  starFilterBtnActive: {
    background: '#fef3c7',
    borderColor: '#f59e0b',
    fontWeight: 700,
  },
  tagFilter: {
    display: 'flex',
    gap: 8,
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
    padding: '20px 20px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
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
