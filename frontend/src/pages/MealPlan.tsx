import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MealPlanDay {
  id?: string;
  weekday: number;
  recipe_id: string | null;
  recipe_title?: string | null;
  note: string | null;
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

// ─── CreateRecipeInline ───────────────────────────────────────────────────────

interface CreateRecipeInlineProps {
  initialTitle: string;
  onCreated: (recipe: Recipe) => void;
  onCancel: () => void;
}

function CreateRecipeInline({ initialTitle, onCreated, onCancel }: CreateRecipeInlineProps) {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const recipe = await apiPost<Recipe>('/api/recipes', {
        title: title.trim(),
        url: url.trim() || null,
        servings: 4,
        prep_minutes: null,
        tags: [],
      });
      onCreated(recipe);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl');
      setSaving(false);
    }
  }

  return (
    <div style={styles.createRecipeWrap}>
      <button style={styles.fsBackLink} onClick={onCancel}>← Tilbage</button>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1a1a1a' }}>Ny opskrift</h3>
      <label style={styles.createLabel}>Navn</label>
      <input
        style={styles.fsSearchInput}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Opskriftens navn"
      />
      <label style={styles.createLabel}>Link (valgfrit)</label>
      <input
        style={styles.fsSearchInput}
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://…"
      />
      {error && <p style={{ color: '#e53935', fontSize: 13, margin: 0 }}>{error}</p>}
      <button
        style={{ ...styles.freetextSaveBtn, opacity: saving || !title.trim() ? 0.5 : 1 }}
        disabled={saving || !title.trim()}
        onClick={handleCreate}
      >
        {saving ? 'Opretter…' : 'Opret og tilføj til dag'}
      </button>
    </div>
  );
}

// ─── DayEditor — slide-up modal ───────────────────────────────────────────────

interface DayEditorProps {
  weekday: number;
  date: string;
  current: MealPlanDay;
  onSave: (patch: Partial<MealPlanDay>) => void;
  onClose: () => void;
}

function DayEditor({ weekday, date, onSave, onClose }: DayEditorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipe[]>([]);
  const [view, setView] = useState<'search' | 'freetext' | 'create'>('search');
  const [freetext, setFreetext] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    onSave(patch);
  };

  const noResults = query.length > 0 && results.length === 0;
  const dayName = WEEKDAYS[weekday - 1];

  return (
    <div style={styles.fullscreen}>
      {/* Fixed header */}
      <div style={styles.fsHeader}>
        <button style={styles.fsBack} onClick={onClose}>✕</button>
        <span style={styles.fsTitle}>{dayName} {formatDate(date)}</span>
        <div style={{ width: 36 }} />
      </div>

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

          {/* Fixed bottom bar */}
          <div style={styles.fsBottom}>
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
        <CreateRecipeInline
          initialTitle={query}
          onCreated={(recipe) => save({ recipe_id: recipe.id, recipe_title: recipe.title, note: null })}
          onCancel={() => setView('search')}
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
}

function DayCard({ weekday, date, day, onClick }: DayCardProps) {
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
        {hasRecipe && <span style={{ ...styles.pill, background: '#e3f0fc', color: '#1565C0' }}>{day!.recipe_title ?? 'Opskrift'}</span>}
      </div>
      <span style={styles.editIcon}>›</span>
    </button>
  );
}

// ─── WeekView ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  plan: WeekPlan | null;
  monday: string;
  loading: boolean;
  onDayUpdated: (weekday: number, patch: Partial<MealPlanDay>) => void;
  onAddToShopping: () => void;
  onArchive: () => void;
  toastMsg: string | null;
}

function WeekView({ plan, monday, loading, onDayUpdated, onAddToShopping, onArchive, toastMsg }: WeekViewProps) {
  const [editingWeekday, setEditingWeekday] = useState<number | null>(null);

  if (loading) {
    return <div style={styles.loadingWrap}>Indlæser…</div>;
  }

  const dayMap = new Map<number, MealPlanDay>();
  plan?.days.forEach(d => dayMap.set(d.weekday, d));

  const editingDay = editingWeekday !== null
    ? (dayMap.get(editingWeekday) ?? { weekday: editingWeekday, recipe_id: null, note: null })
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
          />
        ))}
      </div>

      {plan && !plan.archived && (
        <div style={styles.weekActions}>
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

      {editingWeekday !== null && plan && editingDay && (
        <DayEditor
          weekday={editingWeekday}
          date={addDays(monday, editingWeekday - 1)}
          current={editingDay}
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function MealPlan() {
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const [plans, setPlans] = useState<(WeekPlan | null)[]>([null, null]);
  const [loading, setLoading] = useState<boolean[]>([true, true]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const updated: MealPlanDay = existingIdx >= 0
        ? { ...p.days[existingIdx], ...patch }
        : { weekday, recipe_id: null, note: null, ...patch };
      const newDays = existingIdx >= 0
        ? p.days.map((d, i) => i === existingIdx ? updated : d)
        : [...p.days, updated];
      next[tabIdx] = { ...p, days: newDays };
      return next;
    });

    try {
      const result = await apiPut<MealPlanDay>(
        `/api/mealplans/${plan.id}/days/${weekday}`,
        { recipe_id: patch.recipe_id ?? null, note: patch.note ?? null }
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
        onDayUpdated={(wd, patch) => handleDayUpdated(activeTab, wd, patch)}
        onAddToShopping={() => handleAddToShopping(activeTab)}
        onArchive={() => handleArchive(activeTab)}
        toastMsg={toastMsg}
      />
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
  // ── Fullscreen DayEditor ──────────────────────────────────────────────────
  fullscreen: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#fff',
    zIndex: 100,
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
    padding: '12px 16px',
    borderTop: '1px solid #e0e0e0',
    background: '#fff',
    flexShrink: 0,
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
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
  // ── CreateRecipeInline ────────────────────────────────────────────────────
  createRecipeWrap: {
    flex: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  createRecipeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  createLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: 500,
    marginBottom: 2,
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
