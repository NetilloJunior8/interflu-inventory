import { Injectable } from '@angular/core';

export interface SuggestionItem {
  code: string;
  description: string;
  source: 'HISTORIAL' | 'PATRON' | 'CATALOGO';
}

export interface SimilarCodeAlert {
  code: string;
  similarTo: string;
  reason: string;
  detail: string;
}

@Injectable({ providedIn: 'root' })
export class PatternSuggesterService {
  private learnedCodes = new Set<string>();
  private readonly storageKey = 'interflu_learned_codes_v1';

  private learnedDimensions = new Set<string>();
  private readonly dimStorageKey = 'interflu_learned_dimensions_v1';

  // Common industrial fractions and dimensions in fluid & piping refacciones
  private readonly commonDimensions = [
    '1/8', '1/4', '3/8', '1/2', '3/4',
    '1', '1 1/4', '1 1/2', '2', '2 1/2',
    '3', '3 1/2', '4', '6',
    '2/4x1/4', '1/2x1/4', '3/4x1/2', '1x1/2', '1 1/2x1', '2x1 1/2'
  ];

  // Common refaccionaria prefixes
  private readonly knownPrefixes = [
    'NMP40', 'NM80', 'NMP80', 'NM40', 'NMP', 'NM',
    'VAL-ESF', 'VAL-RET', 'VAL-AGU', 'VAL-CHE',
    'MAN-100R1', 'MAN-100R2', 'MAN-100R4',
    'CON-JIC', 'CON-NPT', 'CON-ORFS', 'CON-FLANGE',
    'BR-150', 'BR-300', 'BR-600',
    'CODO-90', 'CODO-45', 'TEE', 'NIPLE-HEX', 'TUERCA'
  ];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach(c => this.learnedCodes.add(String(c).toUpperCase().trim()));
        }
      }
      const storedDims = localStorage.getItem(this.dimStorageKey);
      if (storedDims) {
        const dArr = JSON.parse(storedDims);
        if (Array.isArray(dArr)) {
          dArr.forEach(d => this.learnedDimensions.add(String(d).trim()));
        }
      }
    } catch {
      // ignore
    }

    // Seed common refaccionaria codes if empty
    if (this.learnedCodes.size < 5) {
      this.knownPrefixes.forEach(prefix => {
        this.learnedCodes.add(`${prefix} 1/2`);
        this.learnedCodes.add(`${prefix} 3/4`);
        this.learnedCodes.add(`${prefix} 1`);
        this.learnedCodes.add(`${prefix} 3 1/2`);
        this.learnedCodes.add(`${prefix} 2/4x1/4`);
      });
    }
  }

  /**
   * Learns a code entered by Osiris or Alexis so the system gets smarter over time
   */
  learn(code: string) {
    if (!code) return;
    const clean = code.trim().toUpperCase();
    if (clean.length >= 2 && !this.learnedCodes.has(clean)) {
      this.learnedCodes.add(clean);
      this.saveToStorage();
    }
  }

  /**
   * Bulk learn multiple codes (e.g. from existing count sheet or Excel)
   */
  learnBulk(codes: string[]) {
    let added = false;
    for (const c of codes) {
      if (!c) continue;
      const clean = c.trim().toUpperCase();
      if (clean.length >= 2 && !this.learnedCodes.has(clean)) {
        this.learnedCodes.add(clean);
        added = true;
      }
    }
    if (added) this.saveToStorage();
  }

  private saveToStorage() {
    try {
      const list = Array.from(this.learnedCodes).slice(-500); // keep recent 500
      localStorage.setItem(this.storageKey, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  /**
   * Finds or generates intelligent pattern-based completions for a query.
   * e.g. typing "NM80 " suggests "NM80 3 1/2", "NM80 2 1/2", "NM80 1/2", etc.
   * typing "NMP40" suggests "NMP40 2/4x1/4", "NMP40 1/2", etc.
   */
  suggest(query: string, limit = 12): SuggestionItem[] {
    if (!query || query.trim().length === 0) return [];

    const raw = query.trim().toUpperCase();
    const results: SuggestionItem[] = [];
    const seen = new Set<string>();

    // 1. Exact startsWith match from learned codes
    for (const code of this.learnedCodes) {
      if (code.startsWith(raw)) {
        results.push({
          code,
          description: this.inferDescription(code),
          source: 'HISTORIAL'
        });
        seen.add(code);
        if (results.length >= limit) return results;
      }
    }

    // 2. Pattern Extrapolation
    const prefixMatch = raw.match(/^([A-Z0-9\-_]+)(?:\s+(.*))?$/);
    if (prefixMatch) {
      const basePrefix = prefixMatch[1];
      const dimensionPart = prefixMatch[2] || '';

      // Extrapolate with common dimensions
      for (const dim of this.commonDimensions) {
        if (!dimensionPart || dim.toUpperCase().startsWith(dimensionPart)) {
          const candidate = `${basePrefix} ${dim}`;
          if (!seen.has(candidate)) {
            results.push({
              code: candidate,
              description: this.inferDescription(candidate),
              source: 'PATRON'
            });
            seen.add(candidate);
            if (results.length >= limit) return results;
          }
        }
      }
    }

    // 3. Substring match from learned codes
    for (const code of this.learnedCodes) {
      if (!seen.has(code) && code.includes(raw)) {
        results.push({
          code,
          description: this.inferDescription(code),
          source: 'HISTORIAL'
        });
        seen.add(code);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Detects if an entered code is closely similar to any previously recorded or learned codes.
   * Helps catch typos in fractions and dimensions (e.g. typing "NM80 3/8" when "NM80 3/4" was already used).
   */
  detectSimilarCodes(inputCode: string, contextCodes: string[] = []): SimilarCodeAlert[] {
    if (!inputCode || inputCode.trim().length < 3) return [];
    const clean = inputCode.trim().toUpperCase();
    const alerts: SimilarCodeAlert[] = [];
    const seenMatches = new Set<string>();

    // Candidate pool: context codes (current sheet / session) + learned historical codes
    const candidates = new Set<string>([...contextCodes.map(c => c.toUpperCase().trim()), ...this.learnedCodes]);

    for (const cand of candidates) {
      if (!cand || cand === clean) continue; // Skip exact matches (exact duplicates are handled by duplicate detection)

      // Check 1: Shared prefix + different fraction/dimension
      // e.g. "NM80 3 1/2" vs "NM80 2 1/2" or "NMP40 2/4x1/4" vs "NMP40 1/2"
      const cleanParts = clean.split(/\s+/);
      const candParts = cand.split(/\s+/);

      if (cleanParts[0] === candParts[0] && cleanParts.length > 1 && candParts.length > 1) {
        if (!seenMatches.has(cand)) {
          seenMatches.add(cand);
          alerts.push({
            code: clean,
            similarTo: cand,
            reason: `Misma serie '${cleanParts[0]}' con diferente medida/fracción`,
            detail: `Se detectó '${cand}' previamente registrado. Verifica si se trata de '${clean}' o '${cand}'.`
          });
          if (alerts.length >= 3) break;
        }
        continue;
      }

      // Check 2: Levenshtein distance <= 2 for codes >= 5 chars
      if (Math.abs(clean.length - cand.length) <= 2 && clean.length >= 5) {
        const dist = this.levenshtein(clean, cand);
        if (dist <= 2 && !seenMatches.has(cand)) {
          seenMatches.add(cand);
          alerts.push({
            code: clean,
            similarTo: cand,
            reason: `Diferencia de sólo ${dist} caracter(es)`,
            detail: `Existe el código similar '${cand}'. Confirma que no sea un error de digitación.`
          });
          if (alerts.length >= 3) break;
        }
      }
    }

    return alerts;
  }

  private levenshtein(a: string, b: string): number {
    const an = a.length;
    const bn = b.length;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix: number[][] = [];
    for (let i = 0; i <= bn; i++) matrix[i] = [i];
    for (let j = 0; j <= an; j++) matrix[0][j] = j;

    for (let i = 1; i <= bn; i++) {
      for (let j = 1; j <= an; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[bn][an];
  }

  /**
   * Automatically extracts measures, fractions, and patterns from newly saved materials
   * so the quick chips bar expands organically as operators count.
   */
  learnFromMaterials(codes: string[]): number {
    let newlyLearned = 0;
    const fractionRegex = /\b(\d+\s+\d+\/\d+|\d+\/\d+x\d+\/\d+|\d+x\d+\/\d+|\d+\/\d+|\d+MM|\d+mm|SCH40|SCH80|\d+#)\b/gi;
    const prefixRegex = /^([A-Z0-9\-_]{2,8})/i;

    for (const code of codes) {
      if (!code) continue;
      this.learn(code);

      // Extract fractions and dimensions
      const matches = code.match(fractionRegex);
      if (matches) {
        for (const m of matches) {
          const cleanDim = m.trim().toUpperCase();
          if (cleanDim.length >= 2 && !this.learnedDimensions.has(cleanDim)) {
            this.learnedDimensions.add(cleanDim);
            newlyLearned++;
          }
        }
      }

      // Extract common prefix if it looks like an industrial refacción series
      const pMatch = code.trim().match(prefixRegex);
      if (pMatch && pMatch[1]) {
        const cleanP = pMatch[1].toUpperCase();
        if (cleanP.length >= 3 && cleanP.length <= 8 && !this.learnedDimensions.has(cleanP)) {
          this.learnedDimensions.add(cleanP);
          newlyLearned++;
        }
      }
    }

    if (newlyLearned > 0) {
      this.saveDimensionsToStorage();
    }
    return newlyLearned;
  }

  private saveDimensionsToStorage() {
    try {
      const list = Array.from(this.learnedDimensions).slice(-60);
      localStorage.setItem(this.dimStorageKey, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  getLearnedChipsCount(): number {
    return this.learnedDimensions.size;
  }

  /**
   * Helper quick dimension chips for fast 1-click tap (dynamic & adaptive)
   */
  getQuickChips(): string[] {
    const baseChips = [
      '1/4', '3/8', '1/2', '3/4', '1', '1 1/4', '1 1/2', '2', '2 1/2', '3', '3 1/2', '4',
      '2/4x1/4', 'x', '40', '80', 'NMP40', 'NM80'
    ];
    const combined: string[] = [...baseChips];
    const seen = new Set(baseChips.map(c => c.toUpperCase()));

    for (const d of this.learnedDimensions) {
      if (!seen.has(d.toUpperCase())) {
        seen.add(d.toUpperCase());
        combined.push(d);
      }
    }
    return combined;
  }

  private inferDescription(code: string): string {
    const c = code.toUpperCase();
    if (c.startsWith('NM80') || c.startsWith('NMP80')) return 'Conexión Cédula 80 Industrial Refaccionaria';
    if (c.startsWith('NM40') || c.startsWith('NMP40')) return 'Conexión Cédula 40 Industrial Refaccionaria';
    if (c.startsWith('VAL-')) return 'Válvula de Control / Retención Industrial';
    if (c.startsWith('MAN-')) return 'Manguera Hidráulica / Neumática Ensamblada';
    if (c.startsWith('CON-')) return 'Conector Industrial Roscado / Brida';
    if (c.startsWith('BR-')) return 'Brida de Acero / Inox Presión Industrial';
    if (c.startsWith('CODO-')) return 'Codo Conexión Tubería de Presión';
    if (c.startsWith('TEE-')) return 'Tee Derivación Conexión Industrial';
    return 'Refacción de Inventario Físico';
  }
}
