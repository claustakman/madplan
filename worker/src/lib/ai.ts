export interface RecipeSuggestion {
  title: string;
  description: string;
  tags: string[];
  prep_minutes: number | null;
  servings: number;
  ingredients: Array<{ name: string; quantity: string }>;
  url: string | null;
}

export interface PlanSuggestion {
  [weekday: number]: {
    recipe_id: string | null;
    suggested_recipe: RecipeSuggestion | null;
    note: string | null;
  };
}

export async function suggestRecipes(
  prompt: string,
  apiKey: string
): Promise<RecipeSuggestion[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Du er en dansk madassistent. Foreslå 3 opskrifter baseret på: "${prompt}".

Svar KUN med et JSON-array (ingen tekst udenfor JSON):
[
  {
    "title": "Opskriftsnavn",
    "description": "Kort beskrivelse (1-2 sætninger)",
    "tags": ["tag1", "tag2"],
    "prep_minutes": 30,
    "servings": 4,
    "ingredients": [{"name": "Kyllingebryst", "quantity": "600g"}, ...],
    "url": null
  }
]`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

  const data = await response.json() as { content: Array<{ text: string }> };
  const text = data.content[0].text.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid AI response format');
  return JSON.parse(jsonMatch[0]) as RecipeSuggestion[];
}

export async function suggestPlan(
  prompt: string,
  days: number[],
  existingRecipes: Array<{ id: string; title: string; tags: string[] }>,
  apiKey: string
): Promise<PlanSuggestion> {
  const recipeList = existingRecipes.map(r => `- ID: ${r.id}, Titel: ${r.title}, Tags: ${r.tags.join(', ')}`).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Du er en dansk madassistent. Lav en madplan for dagene ${days.join(', ')} (1=mandag, 7=søndag).

Brugerens ønsker: "${prompt}"

Eksisterende opskrifter (brug disse hvis muligt):
${recipeList || 'Ingen endnu'}

Svar KUN med JSON (ingen tekst udenfor):
{
  "1": {"recipe_id": "uuid-her-eller-null", "suggested_recipe": null, "note": null},
  "2": {"recipe_id": null, "suggested_recipe": {"title": "...", "description": "...", "tags": [], "prep_minutes": 30, "servings": 4, "ingredients": [], "url": null}, "note": null}
}

Brug recipe_id fra eksisterende opskrifter hvis de passer. Ellers udfyld suggested_recipe med ny opskrift.`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

  const data = await response.json() as { content: Array<{ text: string }> };
  const text = data.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response format');
  return JSON.parse(jsonMatch[0]) as PlanSuggestion;
}
