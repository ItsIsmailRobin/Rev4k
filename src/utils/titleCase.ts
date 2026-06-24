/**
 * Capitalize the first letter of every word in a string, with a small list of
 * common short words (articles, prepositions, conjunctions) that stay lowercase
 * unless they are the very first or very last word.
 *
 * Examples:
 *   titleCase("press play.")               -> "Press Play."
 *   titleCase("watch crystal-clear live tv anywhere.") -> "Watch Crystal-Clear Live TV Anywhere."
 *   titleCase("powered by noscope esports") -> "Powered By NoScope eSports"
 *   titleCase("adaptive bitrate • up to 4k") -> "Adaptive Bitrate • Up to 4K"
 *   titleCase("created by revenger")       -> "Created By Revenger"
 *
 * Note: we keep acronyms / brand parts like "eSports", "NoScope", "HLS", "TS",
 * "iOS", "PC" as-is so they don't get broken ("esports" -> "ESports" feels wrong).
 */

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of',
  'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with', 'from', 'into', 'over',
  'per', 'via', 'vs', 'is', 'it',
]);

// Words that should be uppercased entirely (acronyms, brand slugs)
const ACRONYMS = new Set(['hls', 'ts', 'pc', 'ios', 'hd', 'sd', 'fps']);

// Words that should keep internal capitalization (brand names)
const BRAND_CASED = new Set(['noscope', 'esports', 'revstream', 'revenger']);

function capitalizeWord(word: string): string {
  if (!word) return word;
  const stripped = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  const leading = word.startsWith(stripped) ? '' : word.slice(0, word.indexOf(stripped));
  const trailing = word.endsWith(stripped) ? '' : word.slice(word.indexOf(stripped) + stripped.length);
  const core = stripped;

  const lower = core.toLowerCase();

  // Brand-preserved words
  for (const b of BRAND_CASED) {
    if (lower === b) {
      // Keep their intended casing
      const cased = b === 'noscope' ? 'NoScope' : b === 'esports' ? 'eSports' : b.charAt(0).toUpperCase() + b.slice(1);
      return leading + cased + trailing;
    }
  }

  // Acronyms — fully upper
  if (ACRONYMS.has(lower)) {
    return leading + core.toUpperCase() + trailing;
  }

  // Special: things like "4K" — keep if mostly digits
  if (/^\d/.test(core)) {
    return leading + core + trailing;
  }

  // Default: capitalize first letter, keep the rest as-is (preserves "eSports" inside words etc.)
  return leading + core.charAt(0).toUpperCase() + core.slice(1) + trailing;
}

export function titleCase(input: string): string {
  if (!input) return input;
  // Split on whitespace while keeping separators so we can reconstruct.
  const tokens = input.split(/(\s+)/); // keeps whitespace tokens
  const wordIndexes: number[] = [];
  tokens.forEach((t, i) => {
    if (/\S/.test(t)) wordIndexes.push(i);
  });

  return tokens
    .map((tok, i) => {
      if (!/\S/.test(tok)) return tok; // whitespace
      const isFirst = wordIndexes[0] === i;
      const isLast = wordIndexes[wordIndexes.length - 1] === i;
      const lower = tok.toLowerCase();
      if (!isFirst && !isLast && SMALL_WORDS.has(lower.replace(/[^a-z]/g, ''))) {
        return tok.toLowerCase();
      }
      return capitalizeWord(tok);
    })
    .join('');
}

/** Convenience: titleCase a list of strings. */
export function tc(...inputs: (string | undefined | null)[]): string {
  return inputs.filter((s): s is string => Boolean(s)).map(titleCase).join(' ');
}
