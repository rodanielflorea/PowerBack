// A small syntax colorizer for the code notes (note.html): comments, strings,
// numbers, keywords, literals, types, function names and decorators, for the
// languages interview code comes in. No library: the page's CSP allows only
// local scripts, and this covers what a note needs.
//
//   aceHighlight(code, lang) -> HTML (escaped, one <span class="hl-…"> per token)
//   aceGuessLang(code)       -> a language name when the fence had none
(function () {
  const words = (s) => new Set(s.split(/\s+/).filter(Boolean));
  const KW = {
    js: words(`async await break case catch class const continue debugger default delete do else export extends
      finally for from function get if implements import in instanceof interface let new of package private
      protected public readonly return set static super switch throw try type typeof var void while with yield
      as abstract declare enum keyof namespace satisfies`),
    java: words(`abstract assert break case catch class const continue default do else enum extends final finally
      for goto if implements import instanceof interface native new package private protected public return
      static strictfp super switch synchronized throw throws transient try volatile while var record sealed
      permits yield fun val when object companion data open override lateinit suspend internal is in out
      by init def trait match implicit lazy`),
    cs: words(`abstract as async await base break case catch checked class const continue default delegate do else
      enum event explicit extern finally fixed for foreach get goto if implicit in init interface internal is
      lock namespace new operator out override params private protected public readonly record ref return
      sealed set sizeof stackalloc static struct switch throw try typeof unchecked unsafe using var virtual
      volatile when where while yield`),
    c: words(`auto break case const continue default do else enum extern for goto if inline register restrict
      return sizeof static struct switch typedef union volatile while class namespace template typename public
      private protected virtual override final friend operator new delete this using try catch throw constexpr
      consteval noexcept static_cast dynamic_cast reinterpret_cast const_cast explicit mutable decltype`),
    go: words(`break case chan const continue default defer else fallthrough for func go goto if import interface
      map package range return select struct switch type var`),
    rust: words(`as async await break const continue crate dyn else enum extern fn for if impl in let loop match
      mod move mut pub ref return static struct super trait type unsafe use where while`),
    swift: words(`associatedtype class deinit enum extension fileprivate func import init inout internal let open
      operator private protocol public rethrows static struct subscript typealias var break case continue
      default defer do else fallthrough for guard if in repeat return switch where while as catch is throw
      throws try async await some any`),
    php: words(`abstract and as break callable case catch class clone const continue declare default do echo else
      elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach
      function global goto if implements include include_once instanceof insteadof interface isset list match
      namespace new or print private protected public readonly require require_once return static switch throw
      trait try unset use var while xor yield`),
    py: words(`and as assert async await break class continue def del elif else except finally for from global if
      import in is lambda nonlocal not or pass raise return try while with yield match case`),
    rb: words(`alias and begin break case class def defined do else elsif end ensure for if in module next not or
      redo rescue retry return super then undef unless until when while yield require attr_accessor
      attr_reader attr_writer private protected public`),
    sh: words(`if then else elif fi for while until do done case esac function in return local export readonly
      declare echo exit set unset shift source alias cd`),
    sql: words(`select from where and or not insert into values update set delete create table index view drop
      alter add column join inner left right outer full cross on group by order having limit offset as distinct
      union all is in exists between like ilike case when then else end primary key foreign references default
      unique check constraint with recursive returning begin commit rollback transaction asc desc over partition
      window row rows range unbounded preceding following current cascade if replace temporary truncate
      grant revoke procedure function trigger declare return returns language`),
    lua: words(`and break do else elseif end for function goto if in local not or repeat return then until while`),
  };
  const LIT = words(`true false null undefined NaN Infinity None True False nil self this Self super iota nullptr`);
  // Built-in types and functions worth a color of their own.
  const TYPES = words(`int long short byte char float double bool boolean void string str list dict set tuple
    object any unknown never number bigint symbol i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64
    String Vec Option Result Box HashMap HashSet BTreeMap uint int8 int16 int32 int64 uint8 uint16 uint32 uint64
    float32 float64 rune error decimal size_t auto`);

  // Keywords only in some positions: followed by "(" they are a call.
  const CONTEXTUAL = words('get set type match from of as init yield print echo declare readonly select range map');

  const FAMILY = {
    js: 'js', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
    java: 'java', kotlin: 'java', kt: 'java', scala: 'java', groovy: 'java', dart: 'java',
    cs: 'cs', csharp: 'cs', 'c#': 'cs',
    c: 'c', h: 'c', cpp: 'c', 'c++': 'c', cc: 'c', cxx: 'c', hpp: 'c', objc: 'c', 'objective-c': 'c',
    go: 'go', golang: 'go', rust: 'rust', rs: 'rust', swift: 'swift', php: 'php',
    py: 'py', python: 'py', python3: 'py', rb: 'rb', ruby: 'rb',
    sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', ps1: 'sh', powershell: 'sh', dockerfile: 'sh',
    makefile: 'sh', make: 'sh', yaml: 'sh', yml: 'sh', toml: 'sh', ini: 'sh', r: 'sh',
    sql: 'sql', mysql: 'sql', postgres: 'sql', postgresql: 'sql', plsql: 'sql', tsql: 'sql', sqlite: 'sql',
    lua: 'lua', json: 'json', jsonc: 'json',
    html: 'markup', xml: 'markup', svg: 'markup', vue: 'markup', xhtml: 'markup', css: 'css', scss: 'css', less: 'css',
  };

  // Which comments and strings a family has.
  function rulesFor(fam) {
    const hash = fam === 'py' || fam === 'rb' || fam === 'sh';
    const dash = fam === 'sql' || fam === 'lua';
    const parts = [];
    if (fam === 'markup') parts.push(['c', /<!--[\s\S]*?(?:-->|$)/.source]);
    if (fam === 'lua') parts.push(['c', /--\[\[[\s\S]*?(?:\]\]|$)/.source]);
    if (!hash && fam !== 'markup') parts.push(['c', /\/\*[\s\S]*?(?:\*\/|$)/.source]);
    if (!hash && !dash && fam !== 'markup' && fam !== 'css' && fam !== 'json') parts.push(['c', /\/\/[^\n]*/.source]);
    if (hash) parts.push(['c', /#[^\n]*/.source]);
    if (dash) parts.push(['c', /--[^\n]*/.source]);
    if (fam === 'py') parts.push(['s', /(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/.source]);
    parts.push(['s', /"(?:[^"\\\n]|\\[\s\S])*"?/.source]);
    if (fam !== 'rust' && fam !== 'markup') parts.push(['s', /'(?:[^'\\\n]|\\[\s\S])*'/.source]);
    if (fam === 'rust') parts.push(['s', /'(?:[^'\\\n]|\\[\s\S])'/.source]);
    if (fam === 'js' || fam === 'go' || fam === 'sh' || fam === 'sql') parts.push(['s', /`(?:[^`\\]|\\[\s\S])*`?/.source]);
    if (fam === 'c' || fam === 'cs') parts.push(['d', /^[ \t]*#[ \t]*\w+/.source]);
    if (fam === 'css') parts.push(['n', /#[\da-fA-F]{3,8}\b/.source]);
    if (fam === 'markup') parts.push(['k', /<\/?[\w:.-]+|\/?>/.source], ['f', /[\w:.-]+(?=\s*=)/.source]);
    parts.push(['n', /\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z%]*\b/.source]);
    if (fam !== 'markup' && fam !== 'css' && fam !== 'sql') parts.push(['d', /@[A-Za-z_][\w.]*/.source]);
    parts.push(['w', /[A-Za-z_$][\w$]*/.source]);
    parts.push(['o', /[\s\S]/.source]);
    const re = new RegExp(parts.map(([, src]) => '(' + src + ')').join('|'), 'gm');
    return { re, kinds: parts.map(([k]) => k) };
  }
  const cache = {};

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function guessLang(code) {
    const s = String(code || '');
    if (/^\s*</.test(s) && />\s*$/.test(s)) return 'html';
    if (/^\s*(select|insert|update|delete|create|with|alter)\b[\s\S]*\b(from|into|table|set|as)\b/i.test(s)) return 'sql';
    if (/^#!.*\b(ba|z)?sh\b/.test(s)) return 'sh';
    if (/^\s*(def |class \w+(\(.*\))?:|from [\w.]+ import |import \w+\s*$|if __name__)/m.test(s) && !/[;{]\s*$/m.test(s)) return 'py';
    if (/^\s*(package main|func \w+\(|import \()/m.test(s)) return 'go';
    if (/^\s*(fn \w+|let mut |use \w+::|impl\b)/m.test(s)) return 'rust';
    if (/^\s*(public |private |protected )?(static )?(class|interface) \w+|System\.out\.|public static void main/m.test(s)) return 'java';
    if (/^\s*#include\b|std::|cout\s*<</m.test(s)) return 'cpp';
    if (/\busing System\b|Console\.Write/.test(s)) return 'cs';
    if (/^\s*(const|let|var|function|import|export)\b|=>|console\.log/m.test(s)) return 'js';
    return '';
  }

  // Tokens, in order: [{ k: 'c'|'s'|'n'|'k'|'l'|'t'|'f'|'d'|'', text }]
  function tokens(code, lang) {
    const name = String(lang || '').toLowerCase().trim();
    const fam = FAMILY[name] || FAMILY[guessLang(code)] || 'js';
    const r = cache[fam] || (cache[fam] = rulesFor(fam));
    const kw = KW[fam] || new Set();
    const sqlish = fam === 'sql';
    const out = [];
    const src = String(code || '');
    const peek = /\s*(\S)/y; // the next non-space character after a word
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(src))) {
      let kind = '';
      for (let i = 1; i < m.length; i++) if (m[i] !== undefined) { kind = r.kinds[i - 1]; break; }
      const text = m[0];
      if (kind === 'w') {
        const before = src[m.index - 1];
        peek.lastIndex = r.re.lastIndex;
        const after = peek.exec(src);
        const word = sqlish ? text.toLowerCase() : text;
        if (before === '.' ) kind = after && after[1] === '(' ? 'f' : '';
        else if (LIT.has(text)) kind = 'l';
        else if (kw.has(word) && !(CONTEXTUAL.has(word) && after && after[1] === '(')) kind = 'k';
        else if (TYPES.has(text)) kind = 't';
        else if (after && after[1] === '(') kind = 'f';
        else if (/^[A-Z][a-z0-9]\w*$/.test(text) && fam !== 'sql') kind = 't';
        else kind = '';
      } else if (kind === 'o') kind = '';
      const last = out[out.length - 1];
      if (last && last.k === kind && !kind) last.text += text;
      else out.push({ k: kind, text });
    }
    return out;
  }

  function highlight(code, lang) {
    return tokens(code, lang).map((t) => (t.k ? `<span class="hl-${t.k}">${esc(t.text)}</span>` : esc(t.text))).join('');
  }

  window.aceHighlight = highlight;
  window.aceGuessLang = guessLang;
})();
