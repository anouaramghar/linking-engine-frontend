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
 * Order rows by the persisted delivery rank when the engine recorded one.
 * Missing ranks are legacy rows, so they stay after ranked rows while keeping
 * the server's original order among themselves.
 */
export const sortSuggestionsByFinalRank = (suggestions: Suggestion[]) =>
  suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((left, right) => {
      const leftRank = left.suggestion.final_rank ?? Number.POSITIVE_INFINITY;
      const rightRank = right.suggestion.final_rank ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ suggestion }) => suggestion);

/**
 * Keep the API's queue order for source groups while making each source's rows
 * follow the final ranking that the engine persisted for that source.
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

  return Array.from(groups.values()).map((group) => ({
    ...group,
    suggestions: sortSuggestionsByFinalRank(group.suggestions),
  }));
};
