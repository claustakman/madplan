import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/api';
import CreateRecipeModal from '../components/CreateRecipeModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MealPlanDay {
  id?: string;
  weekday: number;
  recipe_id: string | null;
  recipe_title?: string | null;
  note: string | null;
  assigned_user_id: string | null;
  assigned_user_name?: string | null;
}

interface User {
  id: string;
  name: string;
}

interface WeekPlan {
  id: string;
  week_start: string;
  name: string;
  archived: number;
  days: MealPlanDay[];
}

interface Recipe {
  id: string;
  title: string;
  tags: string;
  prep_minutes: number | null;
  servings: number;
}

interface FullRecipe extends Recipe {
  description: string | null;
  url: string | null;
  rating: number;
  ingredients: { id: string; name: string; quantity: string | null; category_id: string | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

function getWeekNumber(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

// ─── DayEditor — slide-up modal ───────────────────────────────────────────────

interface DayEditorProps {
  weekday: number;
  date: string;
  current: MealPlanDay;
  users: User[];
  onSave: (patch: Partial<MealPlanDay>) => void;
  onClose: () => void;
}

function DayEditor({ weekday, date, current, users, onSave, onClose }: DayEditorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipe[]>([]);
  const [view, setView] = useState<'search' | 'freetext' | 'create'>('search');
  const [freetext, setFreetext] = useState('');
  const [assignedUserId, setAssignedUserId] = useState<string | null>(current.assigned_user_id ?? null);
  const [saving, setSaving] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track visual viewport to keep bottom bar above the keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setKbOffset(Math.max(0, hidden));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const path = query.length > 0
          ? `/api/recipes?q=${encodeURIComponent(query)}&limit=20`
          : `/api/recipes?limit=10`;
        const data = await apiGet<Recipe[]>(path);
        setResults(data);
      } catch { setResults([]); }
    }, query.length > 0 ? 300 : 0);
  }, [query]);

  const save = (patch: Partial<MealPlanDay>) => {
    if (saving) return;
    setSaving(true);
    onSave({ ...patch, assigned_user_id: assignedUserId });
  };

  const noResults = query.length > 0 && results.length === 0;
  const dayName = WEEKDAYS[weekday - 1];
  const assignedChanged = assignedUserId !== (current.assigned_user_id ?? null);
  const hasContent = !!(current.recipe_id || current.note);

  return (
    <div style={styles.fullscreen}>
      {/* Fixed header */}
      <div style={styles.fsHeader}>
        <button style={styles.fsBack} onClick={onClose}>✕</button>
        <span style={styles.fsTitle}>{dayName} {formatDate(date)}</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Ansvarlig bruger */}
      {users.length > 0 && (
        <div style={styles.fsUserRow}>
          <span style={styles.fsUserLabel}>Ansvarlig:</span>
          <button
            style={{ ...styles.fsUserBtn, ...(assignedUserId === null ? styles.fsUserBtnActive : {}) }}
            onClick={() => setAssignedUserId(null)}
          >
            Ingen
          </button>
          {users.map(u => (
            <button
              key={u.id}
              style={{ ...styles.fsUserBtn, ...(assignedUserId === u.id ? styles.fsUserBtnActive : {}) }}
              onClick={() => setAssignedUserId(u.id)}
            >
              {u.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {view === 'search' && (
        <>
          {/* Fixed search bar */}
          <div style={styles.fsSearchBar}>
            <input
              style={styles.fsSearchInput}
              type="text"
              placeholder="Søg i opskrifter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Scrollable results */}
          <div style={styles.fsResults}>
            {results.map(r => (
              <button
                key={r.id}
                style={styles.resultItem}
                onClick={() => save({ recipe_id: r.id, recipe_title: r.title, note: null })}
                disabled={saving}
              >
                <span style={styles.resultTitle}>{r.title}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {parseTags(r.tags).slice(0, 3).map(t => (
                    <span key={t} style={styles.tag}>{t}</span>
                  ))}
                </div>
              </button>
            ))}

            {noResults && (
              <div style={styles.noMatchMsg}>
                Ingen opskrift fundet for "{query}"
              </div>
            )}
          </div>

          {/* Fixed bottom bar — floats above keyboard */}
          <div style={{ ...styles.fsBottom, marginBottom: kbOffset }}>
            {noResults ? (
              <div style={styles.fsBottomRow}>
                <button
                  style={styles.fsBottomBtn}
                  onClick={() => { setView('freetext'); setFreetext(query); }}
                >
                  📝 Gem som fritekst
                </button>
                <button
                  style={{ ...styles.fsBottomBtn, background: '#e3f0fc', color: '#1565C0' }}
                  onClick={() => setView('create')}
                >
                  ＋ Tilføj opskrift
                </button>
              </div>
            ) : (
              <div style={styles.fsBottomRow}>
                {assignedChanged && hasContent ? (
                  <button
                    style={{ ...styles.fsBottomBtn, background: '#1976D2', color: '#fff', opacity: saving ? 0.5 : 1 }}
                    onClick={() => save({ recipe_id: current.recipe_id, recipe_title: current.recipe_title ?? undefined, note: current.note })}
                    disabled={saving}
                  >
                    {saving ? 'Gemmer…' : 'Gem'}
                  </button>
                ) : (
                  <>
                    <button
                      style={{ ...styles.fsBottomBtn, opacity: saving ? 0.5 : 1 }}
                      onClick={() => save({ recipe_id: null, note: null })}
                      disabled={saving}
                    >
                      🗑 Tom dag
                    </button>
                    <button
                      style={{ ...styles.fsBottomBtn, background: '#fff3e0', color: '#e65100', opacity: saving ? 0.5 : 1 }}
                      onClick={() => save({ recipe_id: null, note: 'Rester' })}
                      disabled={saving}
                    >
                      🍲 Rester
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'freetext' && (
        <div style={styles.fsSubview}>
          <button style={styles.fsBackLink} onClick={() => setView('search')}>← Tilbage</button>
          <h3 style={styles.fsSubtitle}>Gem som fritekst</h3>
          <input
            style={styles.fsSearchInput}
            type="text"
            value={freetext}
            onChange={(e) => setFreetext(e.target.value)}
            placeholder="Beskriv måltidet…"
          />
          <button
            style={{ ...styles.fsSaveBtn, opacity: saving || !freetext.trim() ? 0.5 : 1 }}
            disabled={saving || !freetext.trim()}
            onClick={() => save({ recipe_id: null, note: freetext.trim() })}
          >
            Gem
          </button>
        </div>
      )}

      {view === 'create' && (
        <CreateRecipeModal
          initialTitle={query}
          onCreated={(recipe) => save({ recipe_id: recipe.id, recipe_title: recipe.title, note: null })}
          onClose={() => setView('search')}
        />
      )}
    </div>
  );
}

// ─── DayCard ─────────────────────────────────────────────────────────────────

interface DayCardProps {
  weekday: number;
  date: string;
  day: MealPlanDay | undefined;
  onClick: () => void;
  onRecipeClick: (recipeId: string) => void;
}

function UserAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('');
  return (
    <div style={styles.avatar} title={name}>{initials}</div>
  );
}

function DayCard({ weekday, date, day, onClick, onRecipeClick }: DayCardProps) {
  const dayName = WEEKDAYS[weekday - 1];

  const todayStr = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.toISOString().split('T')[0];
  })();
  const isToday = date === todayStr;

  const isEmpty = !day || (day.recipe_id === null && !day.note);
  const isRester = !day?.recipe_id && day?.note === 'Rester';
  const isFreetext = !day?.recipe_id && day?.note && day.note !== 'Rester';
  const hasRecipe = !!day?.recipe_id;

  return (
    <button
      style={{ ...styles.dayCard, borderLeft: isToday ? '3px solid #1976D2' : '3px solid transparent' }}
      onClick={onClick}
    >
      <div style={styles.dayMeta}>
        <span style={{ ...styles.dayName, fontWeight: isToday ? 700 : 400 }}>{dayName}</span>
        <span style={styles.dayDate}>{formatDate(date)}</span>
      </div>
      <div style={styles.dayContent}>
        {isEmpty && <span style={styles.emptyLabel}>Tryk for at planlægge</span>}
        {isRester && <span style={{ ...styles.pill, background: '#fff3e0', color: '#e65100' }}>🍲 Rester</span>}
        {isFreetext && <span style={{ ...styles.pill, background: '#f5f5f5', color: '#555' }}>📝 {day!.note}</span>}
        {hasRecipe && (
          <button
            style={{ ...styles.pill, ...styles.recipePill }}
            onClick={e => { e.stopPropagation(); onRecipeClick(day!.recipe_id!); }}
          >
            {day!.recipe_title ?? 'Opskrift'} <span style={styles.recipePillArrow}>↗</span>
          </button>
        )}
      </div>
      {day?.assigned_user_name && <UserAvatar name={day.assigned_user_name} />}
      <span style={styles.editIcon}>›</span>
    </button>
  );
}

// ─── RecipeDetailModal ────────────────────────────────────────────────────────

function RecipeDetailModal({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const [recipe, setRecipe] = useState<FullRecipe | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartDone, setCartDone] = useState(false);

  useEffect(() => {
    apiGet<FullRecipe>(`/api/recipes/${recipeId}`).then(setRecipe).catch(() => null);
  }, [recipeId]);

  const addAllToShopping = async () => {
    if (!recipe || recipe.ingredients.length === 0) return;
    setAddingToCart(true);
    for (const ing of recipe.ingredients) {
      let categoryId = ing.category_id ?? null;
      // Look up catalog if no category linked, to get the right category
      if (!categoryId && ing.name?.trim()) {
        const matches = await apiGet<Array<{ id: string; name: string; category_id: string | null }>>(
          `/api/ingredients?q=${encodeURIComponent(ing.name.trim())}`
        ).catch(() => []);
        const exact = matches.find(m => m.name.toLowerCase() === ing.name.trim().toLowerCase());
        if (exact) categoryId = exact.category_id;
      }
      await apiPost('/api/shopping', { name: ing.name, category_id: categoryId, quantity: ing.quantity ?? null }).catch(() => null);
    }
    setAddingToCart(false);
    setCartDone(true);
    setTimeout(() => setCartDone(false), 2500);
  };

  return (
    <div style={styles.rdOverlay} onClick={onClose}>
      <div style={styles.rdModal} onClick={e => e.stopPropagation()}>
        <div style={styles.rdHeader}>
          <h2 style={styles.rdTitle}>{recipe?.title ?? '…'}</h2>
          <button style={styles.rdClose} onClick={onClose}>✕</button>
        </div>
        <div style={styles.rdBody}>
          {!recipe ? (
            <p style={{ color: '#999', fontSize: 14 }}>Indlæser…</p>
          ) : (
            <>
              {recipe.url && (
                <a href={recipe.url} target="_blank" rel="noopener noreferrer" style={styles.rdLink}
                  onClick={e => e.stopPropagation()}>
                  🔗 Åbn opskrift
                </a>
              )}
              {recipe.ingredients.length > 0 && (
                <div style={styles.rdSection}>
                  <div style={styles.rdIngHeader}>
                    <span style={styles.rdSectionTitle}>Ingredienser</span>
                    <button
                      style={cartDone ? styles.rdCartDone : styles.rdCart}
                      onClick={addAllToShopping}
                      disabled={addingToCart}
                    >
                      {cartDone ? '✓ Tilføjet' : addingToCart ? 'Tilføjer…' : '🛒 Tilføj til indkøbsliste'}
                    </button>
                  </div>
                  {recipe.ingredients.map(ing => (
                    <div key={ing.id} style={styles.rdIng}>
                      {ing.quantity && <span style={styles.rdQty}>{ing.quantity}</span>}
                      <span>{ing.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {recipe.description && (
                <div style={styles.rdSection}>
                  <span style={styles.rdSectionTitle}>Fremgangsmåde</span>
                  <p style={styles.rdDesc}>{recipe.description}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WeekView ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  plan: WeekPlan | null;
  monday: string;
  loading: boolean;
  users: User[];
  onDayUpdated: (weekday: number, patch: Partial<MealPlanDay>) => void;
  onAddToShopping: () => void;
  onArchive: () => void;
  onAISuggest: () => void;
  toastMsg: string | null;
}

function WeekView({ plan, monday, loading, users, onDayUpdated, onAddToShopping, onArchive, onAISuggest, toastMsg }: WeekViewProps) {
  const [editingWeekday, setEditingWeekday] = useState<number | null>(null);
  const [viewingRecipeId, setViewingRecipeId] = useState<string | null>(null);

  if (loading) {
    return <div style={styles.loadingWrap}>Indlæser…</div>;
  }

  const dayMap = new Map<number, MealPlanDay>();
  plan?.days.forEach(d => dayMap.set(d.weekday, d));

  const editingDay = editingWeekday !== null
    ? (dayMap.get(editingWeekday) ?? { weekday: editingWeekday, recipe_id: null, note: null, assigned_user_id: null })
    : null;

  return (
    <div style={styles.weekWrap}>
      <div style={styles.dayList}>
        {[1, 2, 3, 4, 5, 6, 7].map(wd => (
          <DayCard
            key={wd}
            weekday={wd}
            date={addDays(monday, wd - 1)}
            day={dayMap.get(wd)}
            onClick={() => plan && !plan.archived && setEditingWeekday(wd)}
            onRecipeClick={id => setViewingRecipeId(id)}
          />
        ))}
      </div>

      {plan && !plan.archived && (
        <div style={styles.weekActions}>
          <button style={{ ...styles.actionBtn, background: '#f3e8ff', color: '#7c3aed' }} onClick={onAISuggest}>
            ✨ Forslag til uge
          </button>
          <button style={styles.actionBtn} onClick={onAddToShopping}>
            🛒 Opdater indkøbsliste
          </button>
          <button style={{ ...styles.actionBtn, background: '#f5f5f5', color: '#555' }} onClick={onArchive}>
            📦 Arkiver uge
          </button>
        </div>
      )}

      {plan?.archived === 1 && (
        <div style={styles.archivedBadge}>Denne uge er arkiveret</div>
      )}

      {toastMsg && <div style={styles.toast}>{toastMsg}</div>}

      {viewingRecipeId && (
        <RecipeDetailModal recipeId={viewingRecipeId} onClose={() => setViewingRecipeId(null)} />
      )}

      {editingWeekday !== null && plan && editingDay && (
        <DayEditor
          weekday={editingWeekday}
          date={addDays(monday, editingWeekday - 1)}
          current={editingDay}
          users={users}
          onSave={(patch) => {
            onDayUpdated(editingWeekday, patch);
            setEditingWeekday(null);
          }}
          onClose={() => setEditingWeekday(null)}
        />
      )}
    </div>
  );
}

// ─── AIMealPlanModal ─────────────────────────────────────────────────────────

interface AIDayProposal {
  weekday: number;
  recipe_id: string | null;
  recipe_title: string | null;
  note: string | null;
  isNew?: boolean; // fritekst-forslag, ingen katalog-match
}

function AIMealPlanModal({ monday, onClose, onApply }: {
  monday: string;
  onClose: () => void;
  onApply: (days: AIDayProposal[]) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<'input' | 'loading' | 'review'>('input');
  const [proposals, setProposals] = useState<AIDayProposal[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set([1,2,3,4,5,6,7]));
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const generate = async () => {
    if (!prompt.trim()) return;
    setPhase('loading');
    try {
      type PlanDay = { recipe_id: string | null; suggested_recipe: { title: string } | null; note: string | null };
      const result = await apiPost<Record<string, PlanDay>>('/api/ai/suggest-plan', {
        prompt: prompt.trim(),
        days: [1, 2, 3, 4, 5, 6, 7],
      });
      const days: AIDayProposal[] = Object.entries(result).map(([wd, day]) => ({
        weekday: parseInt(wd),
        recipe_id: day.recipe_id ?? null,
        recipe_title: day.recipe_id ? null : (day.suggested_recipe?.title ?? null),
        note: day.note ?? (day.suggested_recipe?.title ? day.suggested_recipe.title : null),
        isNew: !day.recipe_id && !!day.suggested_recipe,
      }));
      days.sort((a, b) => a.weekday - b.weekday);
      setProposals(days);
      setPhase('review');
    } catch {
      setPhase('input');
      alert('Noget gik galt — prøv igen.');
    }
  };

  const toggleDay = (wd: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(wd) ? next.delete(wd) : next.add(wd);
      return next;
    });
  };

  const apply = () => {
    onApply(proposals.filter(p => selected.has(p.weekday)));
  };

  return (
    <div style={styles.fullscreen}>
      <div style={styles.fsHeader}>
        <button style={styles.fsBack} onClick={onClose}>✕</button>
        <span style={styles.fsTitle}>✨ Forslag til uge</span>
        <div style={{ width: 36 }} />
      </div>

      {phase === 'input' && (
        <div style={styles.fsSubview}>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            Beskriv hvad der skal tages hensyn til denne uge.
          </p>
          <textarea
            ref={inputRef}
            style={{ ...styles.fsSearchInput, resize: 'none' as const, minHeight: 100 }}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="fx: vi har gæster lørdag, vil gerne have vegetar onsdag, noget hurtigt tirsdag"
            rows={4}
          />
          <button
            style={{ ...styles.fsSaveBtn, opacity: prompt.trim() ? 1 : 0.5, marginTop: 4 }}
            onClick={generate}
            disabled={!prompt.trim()}
          >
            Generér forslag ✨
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
          <div style={styles.aiSpinner} />
          <p style={{ fontSize: 15, color: '#999' }}>AI planlægger din uge…</p>
        </div>
      )}

      {phase === 'review' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: '8px 16px' }}>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Vælg hvilke dage du vil anvende. Fritekst-forslag gemmes som noter.
            </p>
            {proposals.map(p => {
              const label = p.recipe_id
                ? `📖 ${p.note ?? 'Opskrift fra katalog'}`
                : p.isNew
                  ? `📝 ${p.note ?? '–'}`
                  : p.note === 'Rester' ? '🍲 Rester' : '–';
              const isChecked = selected.has(p.weekday);
              return (
                <button
                  key={p.weekday}
                  style={{ ...styles.resultItem, ...(!isChecked ? { opacity: 0.45 } : {}) }}
                  onClick={() => toggleDay(p.weekday)}
                >
                  <div style={{ minWidth: 76 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{WEEKDAYS[p.weekday - 1]}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{formatDate(addDays(monday, p.weekday - 1))}</div>
                  </div>
                  <div style={{ flex: 1, fontSize: 14, color: '#333', textAlign: 'left' as const }}>{label}</div>
                  <div style={{ fontSize: 18, color: isChecked ? '#1976D2' : '#ccc' }}>{isChecked ? '✓' : '○'}</div>
                </button>
              );
            })}
          </div>
          <div style={styles.fsBottom}>
            <div style={styles.fsBottomRow}>
              <button style={styles.fsBottomBtn} onClick={() => setPhase('input')}>← Ret</button>
              <button
                style={{ ...styles.fsBottomBtn, background: '#1976D2', color: '#fff', opacity: selected.size ? 1 : 0.5 }}
                onClick={apply}
                disabled={selected.size === 0}
              >
                Anvend {selected.size} dage
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealPlan() {
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const [plans, setPlans] = useState<(WeekPlan | null)[]>([null, null]);
  const [loading, setLoading] = useState<boolean[]>([true, true]);
  const [users, setUsers] = useState<User[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiGet<User[]>('/api/users').then(setUsers).catch(() => null);
  }, []);

  const mondays: [string, string] = [
    getMondayOfWeek(new Date()),
    getMondayOfWeek(new Date(Date.now() + 7 * 86400_000)),
  ];

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(null), 2500);
  };

  const loadWeek = useCallback(async (idx: 0 | 1) => {
    setLoading(prev => { const n = [...prev]; n[idx] = true; return n; });
    const monday = mondays[idx];
    try {
      const all = await apiGet<WeekPlan[]>('/api/mealplans');
      let plan = all.find(p => p.week_start === monday && !p.archived);
      if (!plan) {
        const weekNum = getWeekNumber(new Date(monday + 'T00:00:00'));
        plan = await apiPost<WeekPlan>('/api/mealplans', {
          week_start: monday,
          name: `Uge ${weekNum}`,
        });
      }
      const full = await apiGet<WeekPlan>(`/api/mealplans/${plan.id}`);
      setPlans(prev => { const n = [...prev]; n[idx] = full; return n; });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(prev => { const n = [...prev]; n[idx] = false; return n; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadWeek(0);
    loadWeek(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayUpdated = async (tabIdx: 0 | 1, weekday: number, patch: Partial<MealPlanDay>) => {
    const plan = plans[tabIdx];
    if (!plan) return;

    setPlans(prev => {
      const next = [...prev] as (WeekPlan | null)[];
      const p = next[tabIdx];
      if (!p) return next;
      const existingIdx = p.days.findIndex(d => d.weekday === weekday);
      const base: MealPlanDay = existingIdx >= 0
        ? p.days[existingIdx]
        : { weekday, recipe_id: null, note: null, assigned_user_id: null };
      const updated: MealPlanDay = {
        ...base,
        ...patch,
        assigned_user_id: patch.assigned_user_id !== undefined ? (patch.assigned_user_id ?? null) : (base.assigned_user_id ?? null),
      };
      const newDays = existingIdx >= 0
        ? p.days.map((d, i) => i === existingIdx ? updated : d)
        : [...p.days, updated];
      next[tabIdx] = { ...p, days: newDays };
      return next;
    });

    try {
      const result = await apiPut<MealPlanDay>(
        `/api/mealplans/${plan.id}/days/${weekday}`,
        { recipe_id: patch.recipe_id ?? null, note: patch.note ?? null, assigned_user_id: patch.assigned_user_id ?? null }
      );
      // Re-fetch to get recipe_title from DB join
      const full = await apiGet<WeekPlan>(`/api/mealplans/${plan.id}`);
      setPlans(prev => { const n = [...prev] as (WeekPlan | null)[]; n[tabIdx] = full; return n; });
      void result;
    } catch {
      loadWeek(tabIdx);
    }
  };

  const handleAddToShopping = async (tabIdx: 0 | 1) => {
    const plan = plans[tabIdx];
    if (!plan) return;
    try {
      const { added } = await apiPost<{ added: number }>(`/api/mealplans/${plan.id}/to-shopping-list`, {});
      showToast(added > 0 ? `${added} ingredienser tilføjet til indkøbslisten` : 'Ingen nye ingredienser at tilføje');
    } catch {
      showToast('Fejl ved opdatering af indkøbsliste');
    }
  };

  const handleArchive = async (tabIdx: 0 | 1) => {
    const plan = plans[tabIdx];
    if (!plan) return;
    try {
      await apiPost(`/api/mealplans/${plan.id}/archive`, {});
      setPlans(prev => {
        const next = [...prev] as (WeekPlan | null)[];
        if (next[tabIdx]) next[tabIdx] = { ...next[tabIdx]!, archived: 1 };
        return next;
      });
      showToast('Ugen er arkiveret');
    } catch {
      showToast('Fejl ved arkivering');
    }
  };

  const handleAIApply = async (days: AIDayProposal[]) => {
    setShowAI(false);
    for (const day of days) {
      await handleDayUpdated(activeTab, day.weekday, {
        recipe_id: day.recipe_id,
        recipe_title: day.recipe_title ?? undefined,
        note: day.recipe_id ? null : (day.note ?? null),
        assigned_user_id: null,
      });
    }
    showToast(`${days.length} dage opdateret`);
  };

  return (
    <div style={styles.page}>
      <div style={styles.tabBar}>
        {(['Denne uge', 'Næste uge'] as const).map((label, i) => (
          <button
            key={i}
            style={{ ...styles.tab, ...(activeTab === i ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(i as 0 | 1)}
          >
            {label}
          </button>
        ))}
      </div>

      <WeekView
        plan={plans[activeTab]}
        monday={mondays[activeTab]}
        loading={loading[activeTab]}
        users={users}
        onDayUpdated={(wd, patch) => handleDayUpdated(activeTab, wd, patch)}
        onAddToShopping={() => handleAddToShopping(activeTab)}
        onArchive={() => handleArchive(activeTab)}
        onAISuggest={() => setShowAI(true)}
        toastMsg={toastMsg}
      />

      {showAI && (
        <AIMealPlanModal
          monday={mondays[activeTab]}
          onClose={() => setShowAI(false)}
          onApply={handleAIApply}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary, #f5f5f3)',
    paddingBottom: 80,
  },
  tabBar: {
    display: 'flex',
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  tab: {
    flex: 1,
    padding: '14px 0',
    border: 'none',
    background: 'none',
    fontSize: 15,
    fontWeight: 500,
    color: '#666',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  tabActive: {
    color: '#1976D2',
    borderBottom: '2px solid #1976D2',
  },
  weekWrap: {
    padding: '12px 16px',
  },
  loadingWrap: {
    padding: 32,
    textAlign: 'center',
    color: '#999',
  },
  dayList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  dayCard: {
    display: 'flex',
    alignItems: 'center',
    background: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '12px 14px',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    gap: 12,
    width: '100%',
    minHeight: 56,
    boxSizing: 'border-box',
  },
  dayMeta: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 76,
  },
  dayName: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  dayDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  dayContent: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  emptyLabel: {
    fontSize: 13,
    color: '#bbb',
    fontStyle: 'italic',
  },
  pill: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500,
  },
  editIcon: {
    fontSize: 18,
    color: '#ccc',
    marginLeft: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#1976D2',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    letterSpacing: 0,
  },
  weekActions: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  actionBtn: {
    width: '100%',
    padding: '13px 0',
    background: '#1976D2',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  aiSpinner: {
    width: 40, height: 40, borderRadius: '50%',
    border: '3px solid #e3f0fc', borderTopColor: '#1976D2',
    animation: 'spin 0.8s linear infinite',
  },
  archivedBadge: {
    marginTop: 16,
    textAlign: 'center',
    color: '#999',
    fontSize: 13,
    fontStyle: 'italic',
  },
  toast: {
    position: 'fixed',
    bottom: 90,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#323232',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: 24,
    fontSize: 14,
    zIndex: 200,
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
  recipePill: {
    background: '#e3f0fc',
    color: '#1565C0',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  },
  recipePillArrow: {
    fontSize: 11,
    opacity: 0.7,
    marginLeft: 2,
  },
  // ── RecipeDetailModal ─────────────────────────────────────────────────────
  rdOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  },
  rdModal: {
    width: '100%', maxWidth: 600, background: '#fff',
    borderRadius: '20px 20px 0 0', maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
  },
  rdHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '20px 20px 12px', borderBottom: '1px solid #e0e0e0', flexShrink: 0,
  },
  rdTitle: { flex: 1, fontSize: 20, fontWeight: 700, margin: 0 },
  rdClose: {
    background: 'none', border: 'none', fontSize: 18, color: '#999',
    cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0,
  },
  rdBody: { flex: 1, overflowY: 'auto' as const, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  rdLink: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', background: '#1976D2', color: '#fff',
    borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none', alignSelf: 'flex-start',
  },
  rdSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  rdSectionTitle: {
    fontSize: 12, fontWeight: 700, color: '#999',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  rdIngHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rdCart: {
    padding: '6px 12px', fontSize: 13, background: '#e3f0fc', color: '#1565C0',
    border: '1px solid #b3d1f0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' as const,
  },
  rdCartDone: {
    padding: '6px 12px', fontSize: 13, background: '#e8f5e9', color: '#2e7d32',
    border: '1px solid #a5d6a7', borderRadius: 8, cursor: 'default', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' as const,
  },
  rdIng: { display: 'flex', gap: 10, fontSize: 15, alignItems: 'baseline' },
  rdQty: { color: '#999', fontSize: 14, minWidth: 60 },
  rdDesc: { fontSize: 15, lineHeight: 1.65, color: '#1a1a1a', whiteSpace: 'pre-wrap' as const, margin: 0 },
  // ── User picker ───────────────────────────────────────────────────────────
  fsUserRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    background: '#f9f9f9',
    borderBottom: '1px solid #e0e0e0',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  fsUserLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: 600,
    marginRight: 2,
  },
  fsUserBtn: {
    padding: '5px 14px',
    borderRadius: 20,
    border: '1px solid #e0e0e0',
    background: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    color: '#555',
    fontWeight: 500,
  },
  fsUserBtnActive: {
    background: '#1976D2',
    color: '#fff',
    borderColor: '#1976D2',
  },
  // ── Fullscreen DayEditor ──────────────────────────────────────────────────
  fullscreen: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#fff',
    zIndex: 150,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  fsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
    background: '#fff',
    flexShrink: 0,
  },
  fsBack: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: '#666',
    cursor: 'pointer',
    padding: '4px 8px 4px 0',
    lineHeight: 1,
  },
  fsTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  fsSearchBar: {
    padding: '12px 16px 8px',
    background: '#fff',
    flexShrink: 0,
  },
  fsSearchInput: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    outline: 'none',
    boxSizing: 'border-box' as const,
    background: '#f9f9f9',
  },
  fsResults: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '4px 16px 8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  fsBottom: {
    padding: '12px 16px max(12px, env(safe-area-inset-bottom))',
    borderTop: '1px solid #e0e0e0',
    background: '#fff',
    flexShrink: 0,
  },
  fsBottomRow: {
    display: 'flex',
    gap: 10,
  },
  fsBottomBtn: {
    flex: 1,
    padding: '13px 8px',
    background: '#f5f5f5',
    color: '#555',
    border: 'none',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  fsSubview: {
    flex: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  fsBackLink: {
    background: 'none',
    border: 'none',
    color: '#1976D2',
    fontSize: 14,
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left' as const,
    marginBottom: 4,
  },
  fsSubtitle: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
    color: '#1a1a1a',
  },
  fsSaveBtn: {
    padding: '13px 0',
    background: '#1976D2',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
  // ── Result items ──────────────────────────────────────────────────────────
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '13px 12px',
    background: '#f9f9f9',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    flexWrap: 'wrap' as const,
    boxSizing: 'border-box' as const,
  },
  resultTitle: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: 500,
    flex: 1,
  },
  tag: {
    fontSize: 11,
    background: '#e3f0fc',
    color: '#1565C0',
    padding: '2px 7px',
    borderRadius: 20,
  },
  noMatchMsg: {
    padding: '20px 0 8px',
    fontSize: 14,
    color: '#999',
    textAlign: 'center' as const,
  },
  freetextSaveBtn: {
    padding: '13px 0',
    background: '#1976D2',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 4,
  },
};
