/* Seren 7 — markdown renderer + the ink-settle paint animation.
   Faithful port of reference/Seren_7_original.html lines 692-762 (escape first,
   then add only our own tags). */

export const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[i] + "</code>");
}

const BLOCK = /^(#{1,3}\s|```|>\s?|\s*[-*•]\s+|\s*\d+[.)]\s+|(-{3,}|\*{3,})\s*$)/;

export function md(src) {
  const L = src.replace(/\r/g, "").split("\n");
  let html = "", i = 0, m;
  while (i < L.length) {
    const line = L[i];
    if (/^```/.test(line)) { const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]); i++; html += "<pre><code>" + esc(b.join("\n")) + "</code></pre>"; continue; }
    if (/^\s*$/.test(line)) { i++; continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { const n = m[1].length; html += `<h${n}>${inline(esc(m[2]))}</h${n}>`; i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { html += "<hr>"; i++; continue; }
    if (/^>\s?/.test(line)) { const b = []; while (i < L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/, "")); html += "<blockquote>" + inline(esc(b.join(" "))) + "</blockquote>"; continue; }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items = [];
      while (i < L.length && /^\s*[-*•]\s+/.test(L[i])) { let it = L[i++].replace(/^\s*[-*•]\s+/, ""); while (i < L.length && /^\s{2,}\S/.test(L[i]) && !BLOCK.test(L[i])) it += " " + L[i++].trim(); items.push(it); }
      html += "<ul>" + items.map(t => "<li>" + inline(esc(t)) + "</li>").join("") + "</ul>"; continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const start = parseInt(line, 10) || 1, items = [];
      while (i < L.length && /^\s*\d+[.)]\s+/.test(L[i])) items.push(L[i++].replace(/^\s*\d+[.)]\s+/, ""));
      html += `<ol${start !== 1 ? ` start="${start}"` : ""}>` + items.map(t => "<li>" + inline(esc(t)) + "</li>").join("") + "</ol>"; continue;
    }
    const b = [line]; i++;
    while (i < L.length && !/^\s*$/.test(L[i]) && !BLOCK.test(L[i])) b.push(L[i++]);
    html += "<p>" + b.map(l => inline(esc(l))).join("<br>") + "</p>";
  }
  return html;
}

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* Render markdown into el; words not yet shown fade in like ink settling. */
export function paint(el, text, st) {
  const tpl = document.createElement("template");
  tpl.innerHTML = md(text);
  if (st.instant) { el.replaceChildren(tpl.content); return; }
  st.born = st.born || [];
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const lite = text.length > 2200 || reduceMotion.matches;
  const now = performance.now(), DUR = 700;
  let idx = 0, fresh = 0;
  for (const node of nodes) {
    const parts = node.nodeValue.split(/(\s+)/);
    const frag = document.createDocumentFragment(); let changed = false;
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
      let start = st.born[idx];
      if (start === undefined) { start = now + Math.min(fresh++ * 16, 600); st.born[idx] = start; }
      const age = now - start;
      if (age < DUR) {
        /* a word still settling keeps its place in the animation across re-renders */
        const s = document.createElement("span");
        s.className = lite ? "w lite" : "w";
        s.style.animationDelay = Math.round(-age) + "ms";
        s.textContent = part; frag.appendChild(s); changed = true;
      } else frag.appendChild(document.createTextNode(part));
      idx++;
    }
    if (changed) node.parentNode.replaceChild(frag, node);
  }
  el.replaceChildren(tpl.content);
}
