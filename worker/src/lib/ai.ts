export interface ParsedShoppingItem {
  name: string;
  quantity: string | null;
  ambiguous: boolean;
  alternatives?: string[];
}

export async function parseShopping(
  text: string,
  apiKey: string,
  model = 'claude-haiku-4-20250514'
): Promise<ParsedShoppingItem[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Du er en dansk indkøbsassistent. Udtræk ingredienser/varer fra denne tekst og returnér dem som JSON.

Tekst: "${text}"

Regler:
- Normaliser navne til dansk (fx "tomatoes" → "Tomater")
- Bevar mængder præcist (fx "500g", "2 stk", "en halv liter")
- Sæt ambiguous=true hvis du er usikker på hvad der menes, og angiv alternatives
- Ignorer fyldeord ("og", "samt", "plus" osv.)

Svar KUN med JSON-array:
[
  {"name": "Mælk", "quantity": "1 liter", "ambiguous": false},
  {"name": "Oksekød", "quantity": "500g", "ambiguous": true, "alternatives": ["Hakket oksekød", "Oksekød i skiver"]}
]`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

  const data = await response.json() as { content: Array<{ text: string }> };
  const text2 = data.content[0].text.trim();
  const jsonMatch = text2.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid AI response format');
  return JSON.parse(jsonMatch[0]) as ParsedShoppingItem[];
}

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

export async function generateRecipe(
  prompt: string,
  urlContent: string | null,
  apiKey: string,
  model = 'claude-sonnet-4-20250514'
): Promise<RecipeSuggestion> {
  const context = urlContent
    ? `\n\nIndhold fra URL:\n${urlContent.slice(0, 6000)}`
    : '';

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
          content: `Du er en dansk madassistent. Generér én komplet opskrift baseret på følgende.${context}

Brugerens prompt: "${prompt}"

Svar KUN med ét JSON-objekt (ingen tekst udenfor JSON):
{
  "title": "Opskriftsnavn",
  "description": "Fremgangsmåde trin for trin",
  "tags": ["tag1", "tag2"],
  "prep_minutes": 30,
  "servings": 4,
  "ingredients": [
    {"name": "Kyllingebryst", "quantity": "600g"},
    {"name": "Hvidløg", "quantity": "2 fed"}
  ],
  "url": null
}

Regler:
- Titel og ingredienser på dansk
- Fremgangsmåde som sammenhængende tekst (ikke nummereret liste)
- Mængder præcise og realistiske
- Tags: max 4, vælg fra: vegetar, fisk, kylling, oksekød, pasta, suppe, salat, dessert, hurtig, grill, jul, samt nationalitet/region`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  const data = await response.json() as { content: Array<{ text: string }> };
  const text = data.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response format');
  return JSON.parse(jsonMatch[0]) as RecipeSuggestion;
}

export async function suggestRecipes(
  prompt: string,
  apiKey: string,
  model = 'claude-sonnet-4-20250514'
): Promise<RecipeSuggestion[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
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
  apiKey: string,
  model = 'claude-sonnet-4-20250514'
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
      model,
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
