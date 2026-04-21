import React, { useState } from 'react';
import { apiPost, apiPut } from '../lib/api';

export interface CreatedRecipe {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  servings: number;
  prep_minutes: number | null;
  tags: string;
  created_by: string;
  created_at: string;
}

export interface CreateRecipeModalProps {
  initialTitle?: string;
  onCreated: (r: CreatedRecipe) => void;
  onClose: () => void;
}

interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: null;
  name: string;
  quantity: string | null;
  category_id: null;
  sort_order: number;
}

function textToIngredients(text: string, recipeId: string): RecipeIngredient[] {
  return text.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return { id: crypto.randomUUID(), recipe_id: recipeId, ingredient_id: null, name: trimmed, quantity: null, category_id: null, sort_order: idx };
  }).filter(Boolean) as RecipeIngredient[];
}

export default function CreateRecipeModal({ initialTitle = '', onCreated, onClose }: CreateRecipeModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState('');
  const [servings, setServings] = useState('4');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const tagsArr = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const recipe = await apiPost<CreatedRecipe>('/api/recipes', {
        title: title.trim(),
        description: instructions.trim() || null,
        url: url.trim() || null,
        servings: Number(servings) || 4,
        prep_minutes: prepMinutes ? Number(prepMinutes) : null,
        tags: tagsArr,
      });
      if (ingredientsText.trim()) {
        const ings = textToIngredients(ingredientsText, recipe.id);
        await apiPut(`/api/recipes/${recipe.id}/ingredients`, ings);
      }
      onCreated(recipe);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fejl');
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <h2 style={s.title}>Ny opskrift</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.body}>
          <label style={s.label}>Navn *</label>
          <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Opskriftens navn" />

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

          <label style={s.label}>Ingredienser <span style={s.hint}>(én per linje)</span></label>
          <textarea
            style={{ ...s.input, ...s.textarea }}
            value={ingredientsText}
            onChange={e => setIngredientsText(e.target.value)}
            placeholder={"2 æg\n1 dl mælk\n200 g mel"}
            rows={5}
          />

          <label style={s.label}>Fremgangsmåde</label>
          <textarea
            style={{ ...s.input, ...s.textarea }}
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="Beskriv fremgangsmåden…"
            rows={5}
          />

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.footer}>
          <button style={s.btnSecondary} onClick={onClose}>Annuller</button>
          <button style={{ ...s.btnPrimary, opacity: saving || !title.trim() ? 0.5 : 1 }} onClick={handleCreate} disabled={saving || !title.trim()}>
            {saving ? 'Opretter…' : 'Opret'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    background: '#fff',
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
    borderBottom: '1px solid #e0e0e0',
    flexShrink: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    color: '#1a1a1a',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: '#999',
    cursor: 'pointer',
    padding: 4,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  footer: {
    display: 'flex',
    gap: 10,
    padding: '12px 20px max(12px, env(safe-area-inset-bottom))',
    borderTop: '1px solid #e0e0e0',
    flexShrink: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    marginTop: 10,
  },
  hint: {
    fontWeight: 400,
    color: '#999',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 16,
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fafafa',
    fontFamily: 'inherit',
  },
  textarea: {
    resize: 'vertical' as const,
    lineHeight: 1.5,
  },
  row2: {
    display: 'flex',
    gap: 10,
  },
  error: {
    color: '#e53935',
    fontSize: 13,
    margin: '4px 0 0',
  },
  btnPrimary: {
    flex: 1,
    padding: '13px 0',
    background: '#1976D2',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    flex: 1,
    padding: '13px 0',
    background: '#f0f0f0',
    color: '#444',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
