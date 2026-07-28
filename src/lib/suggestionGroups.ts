import type { ArticleBrief, Suggestion } from "../types/suggestion";

export interface SuggestionGroup {
  key: string;
  siteId: number;
  sourceArticle: ArticleBrief;
  suggestions: Suggestion[];
}

export const suggestionGroupKey = (suggestion: Suggestion) =>
  `${suggestion.site_id}:${suggestion.source_article.id}`;

/**
 * Keep the engine's score order while making every source article contiguous.
 * The first occurrence fixes the group position, so the server's highest-ranked
 * suggestion remains the source group's queue priority.
 */
export const groupSuggestionsBySource = (
  suggestions: Suggestion[],
): SuggestionGroup[] => {
  const groups = new Map<string, SuggestionGroup>();

  suggestions.forEach((suggestion) => {
    const key = suggestionGroupKey(suggestion);
    const existing = groups.get(key);
    if (existing) {
      existing.suggestions.push(suggestion);
      return;
    }

    groups.set(key, {
      key,
      siteId: suggestion.site_id,
      sourceArticle: suggestion.source_article,
      suggestions: [suggestion],
    });
  });

  return Array.from(groups.values());
};
