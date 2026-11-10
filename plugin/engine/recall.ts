// Reading from the library: orientation (brief), answering (recall), one thing in full (read),
// and how two ideas connect (connect). Each returns Markdown sized for a model's context.
import path from 'node:path';
import type { Config } from './config.ts';
import { asList, asText } from './frontmatter.ts';
import { accountBySlug, accountPrinciples, isRetired, resolveLink, topicByPath } from './library.ts';
import type { Account, Library, Principle, Topic } from './library.ts';
import { search } from './search.ts';
import type { Hit } from './search.ts';
import { findSource, readUnits, viewUnit } from './sources.ts';
import { exists, fail, readText, tokens } from './util.ts';

const firstSentence = (text: string) => (/^.*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim()).trim();

function findPrinciple(lib: Library, ref: string): { topic: Topic; principle: Principle } | null {
  const [topicPath, id] = ref.split('#');
  const topic = lib.topics.find(t => t.path === topicPath);
  const principle = topic?.principles.find(p => p.id === id);
  return topic && principle ? { topic, principle } : null;
}

function requireTopic(lib: Library, ref: string): Topic {
  const topic = topicByPath(lib, ref);
  if (!topic) fail('NOT_FOUND', `No topic "${ref}". Topics: ${lib.topics.map(t => t.path).join(', ') || 'none yet'}.`);
  return topic;
}

// ---- brief ----

/** The short form a pinned project gets at session start: the frame's opening and each principle in a sentence. */
export function compactTopic(topic: Topic, limit = 2600): string {
  const out = [`### ${asText(topic.fm.title) || topic.slug} (\`${topic.path}\`)`, '', asText(topic.fm.summary)];
  const opening = topic.frame.split(/\n\s*\n/)[0]?.trim();
  if (opening) out.push('', opening);
  out.push('', 'Principles:');
  for (const p of topic.principles) out.push(`- **${p.title}.** ${firstSentence(p.statement)}`);
  let text = out.join('\n');
  if (text.length > limit) text = text.slice(0, limit).replace(/\n[^\n]*$/, '') + '\n- …';
  return text;
}

export function brief(lib: Library, topicRef?: string): string {
  if (topicRef) {
    const topic = requireTopic(lib, topicRef);
    const accounts = lib.accounts.filter(a => a.topic === topic.path && !isRetired(a));
    const sources = [...new Set(accounts.flatMap(a => asList(a.fm.sources)))];
    return [
      `# ${asText(topic.fm.title) || topic.slug} (\`${topic.path}\`)`,
      '',
      `${asText(topic.fm.summary)} Updated ${asText(topic.fm.updated)}; ${topic.principles.length} principles, ${accounts.length} accounts, sources: ${sources.join(', ') || 'none'}.`,
      '',
      // The page's own title line repeats the heading above.
      topic.body.trim().replace(/^# .*\n+/, ''),
      '',
      '---',
      `This page is the frame. For a specific question, kf_recall with topic "${topic.path}". For one account in full, kf_read with its name from a Governs line. For every account with its one-line gist, kf_read ref "${topic.path}/_index".`,
    ].join('\n');
  }
  const out = ['# Know Fu library', ''];
  if (!lib.topics.length) out.push('The library is empty. Ingest a source from a session opened in the library folder.');
  for (const domain of lib.domains) {
    out.push(`## ${asText(domain.fm.title) || domain.name}`, '', asText(domain.fm.summary), '');
    for (const t of lib.topics.filter(t => t.domain === domain.name)) {
      const accounts = lib.accounts.filter(a => a.topic === t.path && !isRetired(a));
      out.push(`- \`${t.path}\`: ${asText(t.fm.summary)} (${t.principles.length} principles, ${accounts.length} accounts)`);
    }
    out.push('');
  }
  if (lib.sources.length) out.push(`Sources: ${lib.sources.map(s => `${s.key} (${asText(s.fm.title)}${asText(s.fm.status) === 'compiled' ? '' : ', ' + asText(s.fm.status)})`).join('; ')}.`);
  if (lib.ideas.length) out.push(`Ideas on file: ${lib.ideas.length}.`);
  if (lib.inbox.length) out.push(`Inbox: ${lib.inbox.length} saved ${lib.inbox.length === 1 ? 'note' : 'notes'} not yet woven in.`);
  out.push('', 'Next: kf_brief with a topic path loads that topic\'s frame and principles. kf_recall answers a specific question.');
  return out.join('\n');
}

// ---- recall ----

export type RecallOptions = {
  query: string | string[];
  topic?: string;
  /** Approximate token budget for the whole briefing. */
  budget?: number;
  /** "accounts" loads the best accounts whole; "gists" returns one line each, to choose from. */
  load?: 'accounts' | 'gists';
  /** Account names the caller already holds; they are listed, not loaded again. */
  seen?: string[];
  ideas?: boolean;
};

type Ranked = { hit: Hit; score: number };

function rank(lib: Library, queries: string[], topic: string | undefined, ideas: boolean): { accounts: Ranked[]; principles: Ranked[]; ideaHits: Ranked[] } {
  const merged = new Map<string, Ranked>();
  for (const query of queries) {
    const hits = search(lib, query, { tiers: ['principle', 'account', ...(ideas ? (['idea'] as const) : [])], limit: 30, topic });
    const top = hits[0]?.score || 1;
    for (const hit of hits) {
      const normal = hit.score / top;
      const key = `${hit.tier}:${hit.ref}`;
      const had = merged.get(key);
      // A match for several sub-questions rises, but each sub-question's best match keeps a full score.
      if (had) {
        had.score = Math.max(had.score, normal) + 0.25 * Math.min(had.score, normal);
        had.hit.coverage = Math.max(had.hit.coverage, hit.coverage);
      } else merged.set(key, { hit, score: normal });
    }
  }
  const all = [...merged.values()];
  const principles = all.filter(r => r.hit.tier === 'principle').sort((a, b) => b.score - a.score);
  const strength = new Map(principles.map(p => [p.hit.ref, p.score]));
  const accounts = all.filter(r => r.hit.tier === 'account');
  for (const r of accounts) {
    const account = accountBySlug(lib, r.hit.ref);
    if (!account) continue;
    // An account under a principle the question matched is likelier to be what the question is about.
    for (const p of accountPrinciples(account)) r.score += 0.15 * (strength.get(p.includes('#') ? p : `${account.topic}#${p}`) ?? 0);
  }
  accounts.sort((a, b) => b.score - a.score);
  return { accounts, principles, ideaHits: all.filter(r => r.hit.tier === 'idea').sort((a, b) => b.score - a.score) };
}

function accountBlock(account: Account): string {
  const facts = [`\`${account.slug}\``, asText(account.fm.kind), `sources: ${asList(account.fm.sources).join(', ') || 'none'}`];
  if (asText(account.fm.basis) !== 'source') facts.push(`basis: ${asText(account.fm.basis)}`);
  // The account's own headings sit under this briefing's headings, so they move down two levels.
  const body = account.body.trim().replace(/^(#{1,4}) /gm, (_, marks) => '#'.repeat(Math.min(6, marks.length + 2)) + ' ');
  return `### ${asText(account.fm.title)}\n${facts.join(' · ')}\n\n${body}`;
}

const DISPUTE = new Set(['conflicts with', 'qualifies']);

/** Accounts that dispute or qualify the loaded ones. These travel with what they qualify, whatever the budget. */
function disputes(lib: Library, loaded: Account[]): string[] {
  const held = new Set(loaded.map(a => a.slug));
  const lines = new Map<string, string>();
  const note = (other: Account, text: string) => {
    if (!held.has(other.slug) && !isRetired(other)) lines.set(`${other.slug}|${text}`, `- \`${other.slug}\` ${text}: ${asText(other.fm.summary)}`);
  };
  for (const account of loaded)
    for (const link of account.links) {
      if (!DISPUTE.has(link.verb)) continue;
      const target = resolveLink(lib, link.to, link.anchor, account.topic);
      if (target?.type === 'account') note(target.account, `(${account.slug} ${link.verb} it)`);
    }
  for (const other of lib.accounts) {
    if (held.has(other.slug)) continue;
    for (const link of other.links) {
      if (!held.has(link.to)) continue;
      if (DISPUTE.has(link.verb)) note(other, `${link.verb} ${link.to}`);
      else if (asText(other.fm.kind) === 'debate') note(other, `is a debate that involves ${link.to}`);
    }
  }
  return [...lines.values()];
}

export function recall(lib: Library, options: RecallOptions): string {
  const queries = (Array.isArray(options.query) ? options.query : [options.query]).map(q => String(q ?? '').trim()).filter(Boolean);
  if (!queries.length) fail('INVALID', 'Give kf_recall a query: the question in plain words, or a list of sub-questions.');
  const topic = options.topic ? requireTopic(lib, options.topic).path : undefined;
  const budget = Math.max(400, options.budget ?? 4000);
  const seen = new Set(options.seen ?? []);
  const { accounts, principles, ideaHits } = rank(lib, queries, topic, !!options.ideas);
  const out: string[] = [`# Recall: ${queries.join(' / ')}`, ''];
  let spent = 0;
  const say = (text: string) => {
    out.push(text);
    spent += tokens(text) + 1;
  };

  // A source passage is offered only when it holds most of what the question asks about. A page that shares
  // a common word or two looks like evidence and isn't.
  const pageHits = search(lib, queries.join(' '), { tiers: ['map', 'page'], limit: 8 })
    .filter(hit => hit.coverage >= 0.45)
    .slice(0, 5);
  const best = Math.max(0, ...accounts.slice(0, 5).map(r => r.hit.coverage), ...principles.slice(0, 3).map(r => r.hit.coverage));
  if (best < 0.3) {
    say(`Nothing in the compiled library${topic ? ` under ${topic}` : ''} clearly answers this${accounts.length ? ': the nearest accounts share only its common words' : ''}.`);
    if (accounts.length) {
      say('\n## Nearest accounts (probably not about this)\n');
      for (const r of accounts.slice(0, 4)) {
        const account = accountBySlug(lib, r.hit.ref);
        if (account) say(`- \`${account.slug}\` (${asText(account.fm.kind)}, ${account.topic}): ${asText(account.fm.summary)}`);
      }
    }
    if (pageHits.length) {
      say('\n## In the sources\n\nThe original text does speak to it here. Read these with kf_read (ref = the source key, loc = the locator).\n');
      for (const hit of pageHits) say(`- ${hit.ref}: ${hit.snippet}`);
    } else say('\nThe source text has no close match either. Treat this as a gap: say the library does not cover it, and name the kind of source that would. If the library may use other words for it, try those.');
    return out.join('\n');
  }

  // Which accounts to load: the best ones, while they stay close to the top score and fit the budget.
  const top = accounts[0]?.score ?? 0;
  const loaded: Account[] = [];
  const listed: Ranked[] = [];
  const accountBudget = budget * 0.72;
  // A few accounts that bear on the question serve better than many that are merely about the subject,
  // so the count is capped as well as the size: three at the default budget, more only when the caller asks.
  const maxLoaded = Math.max(1, Math.round(budget / 1300));
  let accountTokens = 0;
  for (const r of accounts) {
    const account = accountBySlug(lib, r.hit.ref);
    if (!account) continue;
    const size = tokens(account.body) + 40;
    const wanted = options.load !== 'gists' && !seen.has(account.slug) && r.score >= top * 0.55 && loaded.length < maxLoaded && (loaded.length === 0 || accountTokens + size <= accountBudget);
    if (wanted) {
      loaded.push(account);
      accountTokens += size;
    } else listed.push(r);
  }

  // Principles in play: those governing what was loaded, then any the question matched directly.
  const inPlay = new Map<string, { topic: Topic; principle: Principle }>();
  for (const account of loaded)
    for (const p of accountPrinciples(account)) {
      const found = findPrinciple(lib, p.includes('#') ? p : `${account.topic}#${p}`);
      if (found) inPlay.set(`${found.topic.path}#${found.principle.id}`, found);
    }
  for (const r of principles.slice(0, 4)) {
    const found = findPrinciple(lib, r.hit.ref);
    if (found && r.score >= 0.5) inPlay.set(r.hit.ref, found);
  }
  if (inPlay.size) {
    say('## Principles in play\n');
    for (const { topic: t, principle: p } of [...inPlay.values()].slice(0, 7)) say(`- **${p.title}** (\`${t.path}\`): ${p.statement}${p.breaks ? ` *Breaks when:* ${p.breaks}` : ''}`);
    say('');
  }

  if (loaded.length) {
    say('## Accounts\n');
    for (const account of loaded) say(accountBlock(account) + '\n');
  }

  const caveats = disputes(lib, loaded);
  if (caveats.length) {
    say('## Disputes and qualifications\n\nThese bear on what is loaded above. Read them before relying on it.\n');
    for (const line of caveats) say(line);
    say('');
  }

  const rest = listed.slice(0, options.load === 'gists' ? 14 : 8);
  if (rest.length) {
    say(options.load === 'gists' ? '## Matching accounts\n' : '## Also relevant, not loaded\n');
    for (const r of rest) {
      const account = accountBySlug(lib, r.hit.ref)!;
      say(`- \`${account.slug}\` (${asText(account.fm.kind)}, ${account.topic})${seen.has(account.slug) ? ' [you have this]' : ''}: ${asText(account.fm.summary)}`);
    }
    say('');
  }
  if (ideaHits.length) {
    say('## Ideas on file (candidates, never evidence)\n');
    for (const r of ideaHits.slice(0, 5)) {
      const idea = lib.ideas.find(i => i.slug === r.hit.ref)!;
      say(`- \`${idea.slug}\` [${asText(idea.fm.status)}]: ${asText(idea.fm.summary)}`);
    }
    say('');
  } else if (options.ideas) say('No ideas on file match this.\n');
  if (pageHits.length && spent < budget) {
    say('## In the sources\n\nWhere the original text speaks to this, for detail or to check a claim (kf_read with ref = the key, loc = the locator).\n');
    for (const hit of pageHits) if (spent < budget * 1.1) say(`- ${hit.ref}: ${hit.snippet}`);
    say('');
  }
  out.push('---', `Loaded ${loaded.length} ${loaded.length === 1 ? 'account' : 'accounts'}, about ${spent} tokens. Open any listed account with kf_read ref "<name>".`);
  return out.join('\n');
}

// ---- read ----

export type ReadOptions = { ref: string; loc?: string; view?: 'text' | 'image' | 'layout' };
export type ReadResult = { text: string; image?: string };

export function read(lib: Library, config: Config, options: ReadOptions, guides?: string): ReadResult {
  const ref = String(options.ref ?? '').trim();
  if (!ref) fail('INVALID', 'Give kf_read a ref: an account name, a topic path, a source key, "index", or "guide:<name>".');
  if (ref.startsWith('guide:')) {
    const name = ref.slice(6).replace(/[^a-z-]/g, '');
    const file = guides ? path.join(guides, name === 'skill' ? '../SKILL.md' : `${name}.md`) : '';
    if (!file || !exists(file)) fail('NOT_FOUND', `No guide "${name}". Guides: skill, ingest, format, use.`);
    return { text: readText(file) };
  }
  if (ref === 'index') {
    const file = path.join(lib.root, 'INDEX.md');
    return { text: exists(file) ? readText(file) : brief(lib) };
  }
  if (ref.endsWith('/_index')) {
    const topic = requireTopic(lib, ref.slice(0, -7));
    const file = path.join(topic.dir, '_index.md');
    if (!exists(file)) fail('NOT_FOUND', `${topic.path} has no index yet; kf_check builds it.`);
    return { text: readText(file) };
  }
  if (options.loc || options.view) {
    const source = findSource(lib, ref);
    if (options.view === 'image' || options.view === 'layout') {
      if (!options.loc) fail('INVALID', 'Name the page or moment to view in loc, like "p.112" or "12:34".');
      const viewed = viewUnit(config, source, options.loc, options.view);
      return viewed.path ? { text: `${source.key} ${options.loc}: ${viewed.path}`, image: viewed.path } : { text: `===== ${source.key} ${options.loc} (layout) =====\n${viewed.text}` };
    }
    return { text: readUnits(source, options.loc!) };
  }
  const account = accountBySlug(lib, ref);
  if (account) return { text: readText(account.file) };
  if (ref.includes('#')) {
    const found = findPrinciple(lib, ref);
    if (found) return { text: `From ${found.topic.path}:\n\n${found.principle.text}` };
  }
  const topic = lib.topics.find(t => t.path === ref);
  if (topic) return { text: brief(lib, topic.path) };
  const source = lib.sources.find(s => s.id === ref || s.key === ref.toUpperCase());
  if (source) return { text: readText(source.file) };
  const idea = lib.ideas.find(i => i.slug === ref);
  if (idea) return { text: readText(idea.file) };
  const bySlug = topicByPath(lib, ref);
  if (bySlug) return { text: brief(lib, bySlug.path) };
  const near = search(lib, ref.replace(/-/g, ' '), { tiers: ['account', 'principle', 'topic'], limit: 5 });
  fail('NOT_FOUND', `Nothing is named "${ref}".${near.length ? ` Close: ${near.map(h => h.ref).join(', ')}.` : ''}`);
}

// ---- connect ----

type Edge = { from: string; to: string; verb: string; note: string };

function graph(lib: Library): { edges: Edge[]; label: (id: string) => string } {
  const edges: Edge[] = [];
  const labels = new Map<string, string>();
  for (const topic of lib.topics) {
    labels.set(topic.path, `${asText(topic.fm.title) || topic.slug} (topic)`);
    for (const p of topic.principles) {
      const id = `${topic.path}#${p.id}`;
      labels.set(id, `${p.title} (principle)`);
      edges.push({ from: id, to: topic.path, verb: 'principle of', note: '' });
    }
  }
  for (const account of lib.accounts) {
    if (isRetired(account)) continue;
    labels.set(account.slug, asText(account.fm.title));
    for (const p of accountPrinciples(account)) edges.push({ from: account.slug, to: p.includes('#') ? p : `${account.topic}#${p}`, verb: 'case of', note: '' });
    for (const link of account.links) {
      const target = resolveLink(lib, link.to, link.anchor, account.topic);
      const to = target?.type === 'account' ? target.account.slug : target?.type === 'principle' ? `${target.topic.path}#${target.principle.id}` : target?.type === 'topic' ? target.topic.path : null;
      if (to && to !== account.slug) edges.push({ from: account.slug, to, verb: link.verb, note: link.note });
    }
  }
  return { edges, label: id => labels.get(id) ?? id };
}

function nodeFor(lib: Library, text: string, known: (id: string) => boolean): string {
  const ref = text.trim();
  if (known(ref)) return ref;
  const topic = topicByPath(lib, ref);
  if (topic) return topic.path;
  const hit = search(lib, ref, { tiers: ['account', 'principle'], limit: 1 })[0];
  if (!hit) fail('NOT_FOUND', `Nothing in the library matches "${ref}".`);
  return hit.ref;
}

export function connect(lib: Library, fromText: string, toText?: string): string {
  const { edges, label } = graph(lib);
  const nodes = new Set(edges.flatMap(e => [e.from, e.to]));
  const from = nodeFor(lib, fromText, id => nodes.has(id));
  const step = (id: string) => [...edges.filter(e => e.from === id).map(e => ({ next: e.to, edge: e, forward: true })), ...edges.filter(e => e.to === id).map(e => ({ next: e.from, edge: e, forward: false }))];
  const hop = (e: Edge, forward: boolean) => (forward ? `—${e.verb}→` : `←${e.verb}—`);
  if (!toText) {
    const out = [`# What \`${from}\` connects to`, '', `**${label(from)}**`, ''];
    const first = step(from);
    if (!first.length) out.push('No recorded links. It stands alone in the library so far.');
    for (const s of first) out.push(`- ${hop(s.edge, s.forward)} \`${s.next}\` ${label(s.next)}${s.edge.note ? `: ${s.edge.note}` : ''}`);
    const second = new Map<string, string>();
    for (const s of first)
      for (const t of step(s.next))
        if (t.next !== from && !first.some(f => f.next === t.next) && !t.next.includes('/') === !from.includes('/')) second.set(t.next, `- \`${t.next}\` ${label(t.next)} (through \`${s.next}\`)`);
    if (second.size) out.push('', 'Two steps out:', ...[...second.values()].slice(0, 15));
    return out.join('\n');
  }
  const to = nodeFor(lib, toText, id => nodes.has(id));
  if (from === to) return `Both resolve to \`${from}\` (${label(from)}).`;
  // Breadth-first, so the first chain found is a shortest one. Topics are hubs that join everything, so chains don't pass through them.
  const queue: { at: string; chain: string[] }[] = [{ at: from, chain: [`\`${from}\` ${label(from)}`] }];
  const visited = new Set([from]);
  const found: string[][] = [];
  while (queue.length && found.length < 3) {
    const { at, chain } = queue.shift()!;
    if (chain.length > 11) continue;
    for (const s of step(at)) {
      if (visited.has(s.next) && s.next !== to) continue;
      const isTopic = lib.topics.some(t => t.path === s.next);
      const next = [...chain, hop(s.edge, s.forward) + (s.edge.note ? ` (${s.edge.note})` : ''), `\`${s.next}\` ${label(s.next)}`];
      if (s.next === to) {
        found.push(next);
        continue;
      }
      if (isTopic) continue;
      visited.add(s.next);
      queue.push({ at: s.next, chain: next });
    }
  }
  if (!found.length) {
    const sameTopic = accountBySlug(lib, from)?.topic && accountBySlug(lib, from)?.topic === accountBySlug(lib, to)?.topic;
    return `# \`${from}\` to \`${to}\`\n\nNo chain of recorded links joins them${sameTopic ? ', though they sit in the same topic' : ''}. That is a fact about the library, not about the ideas: if you can see how they relate, that is a connection worth writing into one of the accounts.`;
  }
  return [`# \`${from}\` to \`${to}\``, '', ...found.map((chain, i) => `${i + 1}. ${chain.join(' ')}`), '', 'A chain shows how the library links two ideas. It is a path to read along, not proof that one causes the other.'].join('\n');
}
