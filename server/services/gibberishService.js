// Two-layer gibberish detection (PLANNING §9).
//   Layer 1 — cheap local heuristics (length, repeated chars, word-likeness).
//   Layer 2 — only for borderline cases, escalate to a cheap AI check.
// In mock mode the AI layer returns a permissive default, so offline/CI runs
// rely on Layer 1 alone (clear mashing is still caught locally).
import { ai } from '../config/ai.js';

// Suspicion below LOW → clearly fine; at/above HIGH → clearly gibberish;
// the band between escalates to the AI layer.
const BORDERLINE_LOW = 0.35;
const BORDERLINE_HIGH = 0.55;

// A token looks word-like if its vowel ratio is plausible and it has no long
// consonant run. Catches keyboard-mashing ("asdf", "qwerty", "zxcvbn").
function isWordLike(word) {
  if (word.length <= 2) return true;
  const vowels = (word.match(/[aeiou]/g) ?? []).length;
  const vowelRatio = vowels / word.length;
  if (vowelRatio < 0.2 || vowelRatio > 0.85) return false;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(word)) return false;
  return true;
}

// Layer 1: returns a suspicion score in [0,1] and the reasons that drove it.
export function heuristicScore(text) {
  const t = String(text ?? '').trim();
  const reasons = [];
  let suspicion = 0;

  if (t.replace(/\s/g, '').length < 8) {
    suspicion += 0.5;
    reasons.push('too short to be meaningful');
  }
  if (/(.)\1{5,}/.test(t)) {
    suspicion += 0.5;
    reasons.push('excessive repeated characters');
  }

  const tokens = t.toLowerCase().match(/[a-z']+/g) ?? [];
  if (tokens.length === 0) {
    suspicion += 0.8;
    reasons.push('no alphabetic words');
  } else {
    const ratio = tokens.filter(isWordLike).length / tokens.length;
    if (ratio < 0.3) {
      suspicion += 0.8;
      reasons.push('text does not resemble real words');
    } else if (ratio < 0.5) {
      suspicion += 0.6;
      reasons.push('low proportion of word-like tokens');
    } else if (ratio < 0.7) {
      suspicion += 0.35;
      reasons.push('several non-word tokens');
    }
  }

  return { suspicion: Math.min(suspicion, 1), reasons };
}

function buildPrompt(text) {
  return [
    'You are a content quality filter for a Q&A platform.',
    'Decide whether the following submission is a genuine question/problem (valid)',
    'or meaningless gibberish / keyboard-mashing (invalid).',
    'Respond ONLY as JSON: {"is_valid": boolean, "confidence": number, "reason": string}.',
    '',
    `Submission:\n"""${String(text ?? '').slice(0, 2000)}"""`,
  ].join('\n');
}

/**
 * Detect gibberish. Returns { is_gibberish, layer, reasons, confidence }.
 */
export async function detectGibberish(text) {
  const { suspicion, reasons } = heuristicScore(text);

  if (suspicion < BORDERLINE_LOW) {
    return { is_gibberish: false, layer: 1, reasons, confidence: 1 - suspicion };
  }
  if (suspicion >= BORDERLINE_HIGH) {
    return { is_gibberish: true, layer: 1, reasons, confidence: suspicion };
  }

  // Borderline → Layer 2 AI escalation (permissive default in mock mode).
  const result = await ai.cheapJson(buildPrompt(text), {
    is_valid: true,
    confidence: 0.5,
    reason: 'offline mode: assumed valid',
  });

  const isGibberish = result.is_valid === false;
  return {
    is_gibberish: isGibberish,
    layer: 2,
    reasons: isGibberish ? [...reasons, result.reason].filter(Boolean) : reasons,
    confidence: result.confidence ?? suspicion,
  };
}

export default { detectGibberish, heuristicScore };
