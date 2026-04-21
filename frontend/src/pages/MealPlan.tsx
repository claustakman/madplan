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
      <div style={styles.createRecipeHeader}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Ny opskrift</span>
        <button style={styles.closeBtn} onClick={onCancel}>✕</button>
      </div>
      <label style={styles.createLabel}>Navn</label>
      <input
        style={styles.searchInput}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Opskriftens navn"
      />
      <label style={{ ...styles.createLabel, marginTop: 10 }}>Link (valgfrit)</label>
      <input
        style={styles.searchInput}
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://…"
      />
      {error && <p style={{ color: '#e53935', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
      <button
        style={{ ...styles.freetextSaveBtn, marginTop: 12, opacity: saving || !title.trim() ? 0.5 : 1 }}
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
  const [showFreetext, setShowFreetext] = useState(false);
  const [freetext, setFreetext] = useState('');
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  const dayName = WEEKDAYS[weekday - 1];

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div style={styles.sheet}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetHeader}>
          <span style={styles.sheetTitle}>{dayName} {formatDate(date)}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.specialRow}>
          <button
            style={{ ...styles.specialBtn, opacity: saving ? 0.5 : 1 }}
            onClick={() => save({ recipe_id: null, note: null })}
            disabled={saving}
          >
            🗑 Tom dag
          </button>
          <button
            style={{ ...styles.specialBtn, background: '#fff3e0', color: '#e65100', opacity: saving ? 0.5 : 1 }}
            onClick={() => save({ recipe_id: null, note: 'Rester' })}
            disabled={saving}
          >
            🍲 Rester
          </button>
        </div>

        <div style={styles.searchWrap}>
          <input
            style={styles.searchInput}
            type="text"
            placeholder="Søg i opskrifter…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowFreetext(false); }}
          />
        </div>

        <div style={styles.resultsList}>
          {results.map(r => (
            <button
              key={r.id}
              style={styles.resultItem}
              onClick={() => save({ recipe_id: r.id, recipe_title: r.title, note: null })}
              disabled={saving}
            >
              <span style={styles.resultTitle}>{r.title}</span>
              {parseTags(r.tags).slice(0, 2).map(t => (
                <span key={t} style={styles.tag}>{t}</span>
              ))}
            </button>
          ))}

          {query.length > 0 && results.length === 0 && (
            <div style={styles.noMatch}>
              <span style={styles.noMatchText}>Ingen opskrift fundet for "{query}"</span>
            </div>
          )}
        </div>

        {/* Actions vist når ingen resultater */}
        {query.length > 0 && results.length === 0 && !showFreetext && !showCreateRecipe && (
          <div style={styles.noMatchActions}>
            <button
              style={styles.freetextToggle}
              onClick={() => { setShowFreetext(true); setFreetext(query); }}
            >
              📝 Gem som fritekst
            </button>
            <button
              style={{ ...styles.freetextToggle, borderColor: '#1976D2', color: '#1976D2' }}
              onClick={() => setShowCreateRecipe(true)}
            >
              ＋ Tilføj opskrift
            </button>
          </div>
        )}

        {showFreetext && (
          <div style={styles.freetextWrap}>
            <input
              style={styles.searchInput}
              type="text"
              value={freetext}
              onChange={(e) => setFreetext(e.target.value)}
              placeholder="Beskriv måltidet…"
            />
            <button
              style={{ ...styles.freetextSaveBtn, opacity: saving || !freetext.trim() ? 0.5 : 1 }}
              disabled={saving || !freetext.trim()}
              onClick={() => save({ recipe_id: null, note: freetext.trim() })}
            >
              Gem fritekst
            </button>
          </div>
        )}

        {showCreateRecipe && (
          <CreateRecipeInline
            initialTitle={query}
            onCreated={(recipe) => save({ recipe_id: recipe.id, recipe_title: recipe.title, note: null })}
            onCancel={() => setShowCreateRecipe(false)}
          />
        )}
      </div>
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
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '85vh',
    background: '#fff',
    borderRadius: '20px 20px 0 0',
    padding: '12px 16px 32px',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    background: '#ddd',
    borderRadius: 2,
    margin: '0 auto 12px',
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#999',
    cursor: 'pointer',
    padding: 4,
  },
  specialRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 14,
  },
  specialBtn: {
    flex: 1,
    padding: '10px 0',
    background: '#f5f5f5',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    color: '#555',
    cursor: 'pointer',
  },
  searchWrap: {
    marginBottom: 8,
  },
  searchInput: {
    width: '100%',
    padding: '11px 14px',
    fontSize: 16,
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    outline: 'none',
    boxSizing: 'border-box',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '11px 12px',
    background: '#f9f9f9',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    flexWrap: 'wrap',
    boxSizing: 'border-box',
  },
  resultTitle: {
    fontSize: 14,
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
  noMatch: {
    padding: '8px 0 0',
  },
  noMatchText: {
    fontSize: 13,
    color: '#999',
  },
  noMatchActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #f0f0f0',
  },
  freetextToggle: {
    background: 'none',
    border: '1px solid #999',
    color: '#555',
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
  },
  freetextWrap: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  freetextSaveBtn: {
    padding: '12px 0',
    background: '#1976D2',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  createRecipeWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid #f0f0f0',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  createRecipeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  createLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: 500,
  },
};
