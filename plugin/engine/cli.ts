#!/usr/bin/env node
// The same tools from a shell, for setup, for subagents, and for hosts without MCP.
//   node cli.ts status
//   node cli.ts init <library folder>
//   node cli.ts new audio/mixing --title "Mixing" --summary "…"
//   node cli.ts source add <file> --title "…" --authors "A; B" --year 2018 --key WKH
//   node cli.ts read WKH p.67-80        node cli.ts read WKH p.112 --view image
//   node cli.ts recall "how do I …" --topic audio/mixing --budget 6000
//   node cli.ts check --commit "ingest: …"
import { loadConfig, requireHome } from './config.ts';
import { initLibrary, scaffold } from './init.ts';
import { runTool, TOOLS } from './tools.ts';

function parse(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

const HELP = `Know Fu command line. Commands:
  status                              setup, library contents, tools found
  init <folder>                       create a library and point the config at it
  new <domain>[/<topic>]              create a domain or topic page to fill in (--title, --summary)
  brief [topic]                       library overview, or one topic's frame and principles
  recall "<question>"                 answer material (--topic, --budget, --gists, --ideas)
  read <ref> [loc]                    an account, topic, source, or source text (--view image|layout)
  connect <from> [to]                 how two ideas link
  source add <file> | source list     register a source (--title, --authors "A; B", --year, --kind, --id, --key, --family, --url, --max-cost)
  check                               check the library (--commit "message", --errors-only)
  note --title "…" --body "…"         save a note to the inbox
  pin [topic]                         pin a topic to a project (--project, --remove)`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parse(rest);
  const text = (key: string) => (typeof flags[key] === 'string' ? (flags[key] as string) : undefined);
  const out = async (name: string, args: Record<string, unknown>) => {
    const result = await runTool(name, args);
    console.log(result.text);
  };
  switch (command) {
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return;
    case 'init':
      if (!positional[0]) throw new Error('init needs the library folder.');
      console.log(initLibrary(positional[0], { noConfig: flags.no_config === true }));
      return;
    case 'new': {
      const config = loadConfig();
      requireHome(config, 'Creating a domain or topic');
      console.log(scaffold(config.library, positional[0] ?? '', text('title'), text('summary')));
      return;
    }
    case 'status':
      return out('kf_status', {});
    case 'brief':
      return out('kf_brief', { topic: positional[0] });
    case 'recall':
      return out('kf_recall', {
        query: positional.length > 1 ? positional : positional[0],
        topic: text('topic'),
        budget: text('budget') ? Number(text('budget')) : undefined,
        load: flags.gists ? 'gists' : undefined,
        ideas: flags.ideas === true,
      });
    case 'read':
    case 'text':
      return out('kf_read', { ref: positional[0], loc: positional[1], view: text('view') });
    case 'connect':
      return out('kf_connect', { from: positional[0], to: positional[1] });
    case 'source':
      return out('kf_source', {
        action: positional[0] ?? 'list',
        file: positional[1],
        title: text('title'),
        authors: text('authors')
          ?.split(';')
          .map(a => a.trim())
          .filter(Boolean),
        year: text('year'),
        kind: text('kind'),
        id: text('id'),
        key: text('key'),
        family: text('family'),
        url: text('url'),
        max_cost: text('max_cost') ? Number(text('max_cost')) : undefined,
      });
    case 'check':
      return out('kf_check', { commit: text('commit'), warnings: flags.errors_only ? false : undefined });
    case 'note':
      return out('kf_note', { title: text('title'), body: text('body'), topic: text('topic') });
    case 'pin':
      return out('kf_pin', { topic: positional[0], project: text('project'), remove: flags.remove === true });
    case 'tools':
      console.log(TOOLS.map(t => `${t.name}: ${t.description}`).join('\n\n'));
      return;
    default:
      throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

main().catch(error => {
  console.error(error?.code ? `${error.code}: ${error.message}` : (error?.message ?? error));
  process.exitCode = 1;
});
