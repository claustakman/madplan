import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import CreateRecipeModal, { RecipeForm, RecipeData, RecipeIngredient } from '../components/CreateRecipeModal';

interface Recipe extends RecipeData {
  ingredients?: RecipeIngredient[];
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
