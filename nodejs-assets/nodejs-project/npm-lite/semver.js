'use strict';

/**
 * Lightweight semver parser and range matcher.
 * Supports: ^, ~, >=, <=, >, <, =, x/X/*, ||, hyphen ranges
 * Uses only built-in Node.js — no dependencies.
 */

function parse(version) {
  const cleaned = version.trim().replace(/^[v=]/, '');
  const match = cleaned.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9._-]+))?(?:\+([a-zA-Z0-9._-]+))?$/
  );
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
    raw: cleaned,
  };
}

function compare(a, b) {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    if (i >= a.prerelease.length) return -1;
    if (i >= b.prerelease.length) return 1;
    const ai = a.prerelease[i];
    const bi = b.prerelease[i];
    const aNum = /^\d+$/.test(ai) ? parseInt(ai, 10) : NaN;
    const bNum = /^\d+$/.test(bi) ? parseInt(bi, 10) : NaN;
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum > bNum ? 1 : -1;
    } else if (!isNaN(aNum)) {
      return -1;
    } else if (!isNaN(bNum)) {
      return 1;
    } else {
      if (ai < bi) return -1;
      if (ai > bi) return 1;
    }
  }
  return 0;
}

function parsePartial(str) {
  const v = parse(str);
  if (v) return v;
  const parts = str.split('.');
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    prerelease: [],
    partial: parts.length < 3,
  };
}

function parseRange(rangeStr) {
  if (!rangeStr || rangeStr === '*' || rangeStr === 'latest' || rangeStr === 'x' || rangeStr === 'X' || rangeStr === '') {
    return [[{ op: '>=', version: { major: 0, minor: 0, patch: 0, prerelease: [] } }]];
  }

  const orParts = rangeStr.split('||').map(s => s.trim());
  const sets = [];

  for (const part of orParts) {
    const comparators = [];

    // Hyphen range: 1.0.0 - 2.0.0
    const hyphen = part.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
    if (hyphen) {
      comparators.push({ op: '>=', version: parsePartial(hyphen[1]) });
      const high = parsePartial(hyphen[2]);
      comparators.push({ op: high.partial ? '<' : '<=', version: high.partial ? bump(high) : high });
      sets.push(comparators);
      continue;
    }

    const tokens = part.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      // Caret: ^1.2.3
      const caret = token.match(/^\^(.+)$/);
      if (caret) {
        const v = parsePartial(caret[1]);
        comparators.push({ op: '>=', version: v });
        if (v.major !== 0) {
          comparators.push({ op: '<', version: { major: v.major + 1, minor: 0, patch: 0, prerelease: [] } });
        } else if (v.minor !== 0) {
          comparators.push({ op: '<', version: { major: 0, minor: v.minor + 1, patch: 0, prerelease: [] } });
        } else {
          comparators.push({ op: '<', version: { major: 0, minor: 0, patch: v.patch + 1, prerelease: [] } });
        }
        continue;
      }

      // Tilde: ~1.2.3
      const tilde = token.match(/^~(.+)$/);
      if (tilde) {
        const v = parsePartial(tilde[1]);
        comparators.push({ op: '>=', version: v });
        comparators.push({ op: '<', version: { major: v.major, minor: v.minor + 1, patch: 0, prerelease: [] } });
        continue;
      }

      // Operator: >=1.0.0, <=2.0.0, etc.
      const op = token.match(/^(>=|<=|>|<|=)(.+)$/);
      if (op) {
        comparators.push({ op: op[1], version: parsePartial(op[2]) });
        continue;
      }

      // X-range: 1.x, 1.2.x, *, 1.*
      if (/[xX*]/.test(token)) {
        const parts = token.split('.');
        const maj = (parts[0] === '*' || parts[0] === 'x' || parts[0] === 'X') ? null : parseInt(parts[0], 10);
        const min = (!parts[1] || parts[1] === '*' || parts[1] === 'x' || parts[1] === 'X') ? null : parseInt(parts[1], 10);
        if (maj === null) {
          comparators.push({ op: '>=', version: { major: 0, minor: 0, patch: 0, prerelease: [] } });
        } else if (min === null) {
          comparators.push({ op: '>=', version: { major: maj, minor: 0, patch: 0, prerelease: [] } });
          comparators.push({ op: '<', version: { major: maj + 1, minor: 0, patch: 0, prerelease: [] } });
        } else {
          comparators.push({ op: '>=', version: { major: maj, minor: min, patch: 0, prerelease: [] } });
          comparators.push({ op: '<', version: { major: maj, minor: min + 1, patch: 0, prerelease: [] } });
        }
        continue;
      }

      // Plain version or partial
      const plain = parse(token);
      if (plain) {
        comparators.push({ op: '=', version: plain });
        continue;
      }

      // Partial: 1 or 1.2
      const partial = token.match(/^(\d+)(?:\.(\d+))?$/);
      if (partial) {
        const maj = parseInt(partial[1], 10);
        const min = partial[2] !== undefined ? parseInt(partial[2], 10) : null;
        if (min === null) {
          comparators.push({ op: '>=', version: { major: maj, minor: 0, patch: 0, prerelease: [] } });
          comparators.push({ op: '<', version: { major: maj + 1, minor: 0, patch: 0, prerelease: [] } });
        } else {
          comparators.push({ op: '>=', version: { major: maj, minor: min, patch: 0, prerelease: [] } });
          comparators.push({ op: '<', version: { major: maj, minor: min + 1, patch: 0, prerelease: [] } });
        }
        continue;
      }
    }
    if (comparators.length > 0) sets.push(comparators);
  }

  return sets.length > 0 ? sets : [[{ op: '>=', version: { major: 0, minor: 0, patch: 0, prerelease: [] } }]];
}

function bump(v) {
  if (v.minor === 0 && v.patch === 0) return { major: v.major + 1, minor: 0, patch: 0, prerelease: [] };
  return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: [] };
}

function testComp(version, comp) {
  const c = compare(version, comp.version);
  switch (comp.op) {
    case '>=': return c >= 0;
    case '<=': return c <= 0;
    case '>': return c > 0;
    case '<': return c < 0;
    case '=': return c === 0;
    default: return c === 0;
  }
}

function satisfies(versionStr, rangeStr) {
  const version = parse(versionStr);
  if (!version) return false;
  const sets = parseRange(rangeStr);
  return sets.some(set => set.every(comp => testComp(version, comp)));
}

function maxSatisfying(versions, rangeStr) {
  const matching = versions
    .map(v => ({ raw: v, parsed: parse(v) }))
    .filter(v => v.parsed !== null)
    .filter(v => v.parsed.prerelease.length === 0)
    .filter(v => satisfies(v.raw, rangeStr));

  if (matching.length === 0) return null;
  matching.sort((a, b) => compare(b.parsed, a.parsed));
  return matching[0].raw;
}

module.exports = { parse, compare, satisfies, maxSatisfying };
