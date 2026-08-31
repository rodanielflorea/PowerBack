// Shared Markdown + Mermaid rendering used by BOTH the main answer panel
// (renderer.js) and the sticky note (sticky.js), so diagrams and code blocks
// look identical in both places. Loaded after marked.min.js + mermaid.min.js.

// ── Init ──────────────────────────────────────────────────────────────────────
// Only use themeVariables keys that exist in v11 'base'; invalid keys silently
// corrupt the config and make render() throw.
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'loose',
    fontSize: 16,
    themeVariables: {
      primaryColor:        '#dbeafe',
      primaryTextColor:    '#1e3a5f',
      primaryBorderColor:  '#2563eb',
      lineColor:           '#1f2937',
      edgeLabelBackground: '#f0f9ff',
      clusterBkg:          '#f1f5f9',
      background:          '#ffffff',
      mainBkg:             '#dbeafe',
      nodeBorder:          '#2563eb',
      titleColor:          '#1e3a5f',
      fontFamily:          'system-ui, sans-serif',
    },
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
    sequence:  { useMaxWidth: true, actorFontSize: 15, noteFontSize: 13, messageFontSize: 14 },
    gantt:     { useMaxWidth: true, fontSize: 14 },
    er:        { useMaxWidth: true, fontSize: 14 },
    mindmap:   { useMaxWidth: true },
  });
}
if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

var __mermaidIdSeq = 0;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeMermaid(code) {
  code = code
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\/([^\/\]\\]+)\]/g, '[$1]')
    .replace(/\[\\([^\/\]\\]+)\]/g, '[$1]')
    .replace(/(style\s+\w+\s+[^;\n]*),\s*color:[^,;\n]*/gi, '$1')
    .split('\n').map(function (l) { return l.trimEnd(); }).join('\n');

  // Fix "Setting X as parent of X would create a cycle": a subgraph sharing its
  // id with a node makes that node its own parent. Rename such a subgraph to a
  // unique synthetic id while preserving its displayed title.
  var lines = code.split('\n');
  var sgCounter = 0;
  var codeNoLabels = code.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\{[^}]*\}/g, '');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\s*)subgraph\s+([A-Za-z0-9_]+)(\s*\[[^\]]*\])?\s*$/);
    if (!m) continue;
    var indent = m[1], id = m[2], label = m[3] || ('[' + id + ']');
    var occurrences = (codeNoLabels.match(new RegExp('\\b' + id + '\\b', 'g')) || []).length;
    if (occurrences > 1) lines[i] = indent + 'subgraph __sg' + (sgCounter++) + label;
  }
  return lines.join('\n');
}

// ── Diagram contrast ──────────────────────────────────────────────────────────
function parseFillColor(el) {
  var fill = el.getAttribute('fill') || (el.style && el.style.fill) || getComputedStyle(el).fill || '';
  return fill.trim();
}
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return null;
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}
function cssColorToRgb(color) {
  if (!color || color === 'none' || color === 'transparent') return null;
  if (color.startsWith('#')) return hexToRgb(color);
  var m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}
function relativeLuminance(r, g, b) {
  var rgb = [r, g, b].map(function (c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function fillIsDark(colorStr) {
  var rgb = cssColorToRgb(colorStr);
  if (!rgb) return false;
  return relativeLuminance(rgb.r, rgb.g, rgb.b) < 0.25;
}
function applyDiagramContrast(svgEl) {
  var nodeGroups = svgEl.querySelectorAll('.node, .actor-top, .actor-bottom, .actor, .label-container, .er-entity, .cluster');
  nodeGroups.forEach(function (group) {
    var shape = group.querySelector('rect, circle, ellipse, polygon, path');
    if (!shape) return;
    var fill = parseFillColor(shape);
    if (!fill || fill === 'none' || fill === 'transparent') return;
    var dark = fillIsDark(fill);
    var textColor = dark ? '#ffffff' : '#1a1a1a';
    group.querySelectorAll('text, tspan').forEach(function (t) { t.setAttribute('fill', textColor); t.style.fill = textColor; });
    group.querySelectorAll('foreignObject *').forEach(function (t) { t.style.color = textColor; });
    var borderColor = dark ? 'rgba(255,255,255,0.55)' : '#1e3a5f';
    shape.setAttribute('stroke', borderColor);
    shape.style.stroke = borderColor;
    var sw = parseFloat(shape.getAttribute('stroke-width') || '0');
    if (sw < 1.5) shape.setAttribute('stroke-width', '1.5');
  });

  svgEl.querySelectorAll('.note rect, .noteText, .edgeLabel').forEach(function (el) {
    if (el.tagName === 'rect' || el.tagName === 'RECT') return;
    var parent = el.closest('.note') || el.parentElement;
    var shape = parent && parent.querySelector('rect');
    if (!shape) return;
    var fill = parseFillColor(shape);
    var dark = fillIsDark(fill);
    el.setAttribute && el.setAttribute('fill', dark ? '#ffffff' : '#1a1a1a');
    el.style && (el.style.color = dark ? '#ffffff' : '#1a1a1a');
  });

  var diagramBg = '#ffffff';
  var bgRect = svgEl.querySelector('rect.background, rect#background, rect[class*="background"]');
  if (!bgRect) bgRect = svgEl.querySelector('rect');
  if (bgRect) { var bgFill = parseFillColor(bgRect); if (bgFill && bgFill !== 'none') diagramBg = bgFill; }
  var bgDark = fillIsDark(diagramBg);
  var lineColor = bgDark ? '#e2e8f0' : '#1f2937';

  svgEl.querySelectorAll('.edgePath path, .edgePaths path, .flowchart-link, .messageLine0, .messageLine1, .loopLine, .relation, .er-relationship, path.transition, line').forEach(function (p) {
    if (p.getAttribute('stroke') === 'none') return;
    p.setAttribute('stroke', lineColor);
    p.style.stroke = lineColor;
    var sw = parseFloat(p.getAttribute('stroke-width') || '0');
    if (sw < 1.5) p.setAttribute('stroke-width', '1.5');
    if ((p.getAttribute('fill') || '').toLowerCase() === 'none') p.setAttribute('fill', 'none');
  });

  var existingStyle = svgEl.querySelector('style.ace-contrast-arrows');
  if (!existingStyle) {
    var st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.className = 'ace-contrast-arrows';
    st.textContent = 'marker path, marker polygon, marker circle { fill: ' + lineColor + ' !important; stroke: ' + lineColor + ' !important; }';
    svgEl.insertBefore(st, svgEl.firstChild);
  }
  svgEl.querySelectorAll('marker path, marker polygon, marker circle').forEach(function (m) {
    m.setAttribute('fill', lineColor); m.setAttribute('stroke', lineColor);
    m.style.fill = lineColor; m.style.stroke = lineColor;
  });
  svgEl.querySelectorAll('.activation0, .activation1, .activation2').forEach(function (el) {
    el.setAttribute('stroke', lineColor); el.style.stroke = lineColor;
  });
}

// Render markdown text (with ```mermaid blocks) into `el`. After each diagram's
// SVG is ready, the optional onDiagram(svgEl, placeholderEl) callback runs —
// the answer panel uses it to wire click-to-zoom; the sticky leaves it off.
function renderDiagramsMarkdown(el, onDiagram) {
  const raw = el.textContent || '';
  const diagrams = [];
  const TOKEN = '\x00MERMAID_BLOCK_';
  const withTokens = raw.replace(/```mermaid\s*([\s\S]*?)```/gi, (_, code) => {
    const idx = diagrams.length; diagrams.push(code.trim()); return TOKEN + idx + '\x00';
  });

  let html;
  if (typeof marked !== 'undefined') html = marked.parse(withTokens);
  else html = withTokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  const baseId = __mermaidIdSeq++;
  diagrams.forEach((_, i) => {
    html = html.replace(TOKEN + i + '\x00', '<div class="mermaid-block" id="mermaid-ph-' + baseId + '-' + i + '"></div>');
  });
  el.innerHTML = html;

  if (typeof mermaid !== 'undefined' && diagrams.length > 0) {
    el.classList.add('has-diagram');
    diagrams.forEach((code, i) => {
      const ph = document.getElementById('mermaid-ph-' + baseId + '-' + i);
      if (!ph) return;
      const cleanCode = sanitizeMermaid(code);
      mermaid.render('mermaid-svg-' + baseId + '-' + i, cleanCode)
        .then(function (result) {
          ph.innerHTML = result.svg;
          var svgEl = ph.querySelector('svg');
          if (svgEl) {
            if (!svgEl.getAttribute('viewBox')) {
              var w = parseFloat(svgEl.getAttribute('width') || 0);
              var h = parseFloat(svgEl.getAttribute('height') || 0);
              if (w && h) svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            }
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.height = 'auto';
            applyDiagramContrast(svgEl);
            if (typeof onDiagram === 'function') { try { onDiagram(svgEl, ph); } catch (e) {} }
          }
        })
        .catch(function (err) {
          ph.innerHTML = '<div class="mermaid-error"><b>Diagram error:</b> ' +
            escapeHtml(String(err && err.message || err)) + '</div>' +
            '<pre class="mermaid-raw">' + escapeHtml(cleanCode) + '</pre>';
        });
    });
  }
}
