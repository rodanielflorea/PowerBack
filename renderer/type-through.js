// ── Typing into Ace without taking focus (Windows) ───────────────────────────
// Ace's windows never activate, so the app the user was in keeps focus (see
// main.js, "Keep the other app focused"). A click on a text field here asks
// main for the keyboard: main then takes the typing keys as global hotkeys and
// sends each one to this page, which applies it to the field. The key events
// the page's own handlers listen for (Enter to send, Esc to close, Ctrl+Enter…)
// are dispatched first; unless one of them handles the key, the field is
// edited the way the browser would. Esc, sending the text, or a click on
// anything that is not a text field gives the keyboard back.
// Loaded by index.html and sticky.html, before the page's own scripts.
(function () {
  "use strict";
  const tt = window.typeThrough;
  if (!tt) return;

  let enabled = false;     // Windows, and "keep focus in the other app" is on
  let realFocus = false;   // the window takes real focus for a moment (hotkey recorder)
  let engaged = null;      // the field the keys go to
  let engaging = null;     // the field an engage request is pending for
  let capsLock = false;    // as seen on the last mouse event
  let lastValue = null;    // field value after the last key, to notice a send
  let watchTimer = null;
  let queue = Promise.resolve();

  tt.mode().then((m) => { enabled = !!(m && m.enabled); }).catch(() => {});
  tt.onMode((m) => { enabled = !!(m && m.enabled); if (!enabled) dropLocal(); });
  tt.onReleased(() => dropLocal());

  // The hotkey recorder in Settings needs real key events: it gives the window
  // real focus while it listens.
  window.typeThroughRealFocus = (on) => {
    if (!enabled) return;
    realFocus = !!on;
    if (realFocus) dropLocal();
    tt.realFocus(realFocus).catch(() => {});
  };

  const style = document.createElement("style");
  style.textContent = ".tt-engaged{outline:2px solid rgba(59,130,246,.75)!important;outline-offset:-2px}";
  (document.head || document.documentElement).appendChild(style);

  // ── Fields ──────────────────────────────────────────────────────────────────
  const TEXT_INPUTS = new Set(["text", "search", "url", "tel", "email", "password", "number"]);
  function isTextField(el) {
    if (!el || !el.isConnected || el.disabled || el.readOnly) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") return TEXT_INPUTS.has(el.type);
    return !!el.isContentEditable;
  }
  function textFieldAt(target) {
    const el = target && target.closest ? target.closest("textarea, input, [contenteditable]") : null;
    return isTextField(el) ? el : null;
  }
  function shown(el) { return !!el && el.isConnected && el.getClientRects().length > 0; }
  // number and email inputs have no caret API (selectionStart is null).
  function hasCaret(el) {
    try { return typeof el.selectionStart === "number"; } catch { return false; }
  }
  function valueOf(el) {
    if (!el) return "";
    return "value" in el ? String(el.value || "") : String(el.textContent || "");
  }

  // ── Engage / release ────────────────────────────────────────────────────────
  function markEngaged(el) {
    if (engaged && engaged !== el) engaged.classList.remove("tt-engaged");
    engaged = el;
    el.classList.add("tt-engaged");
    lastValue = valueOf(el);
    startWatch();
  }
  function dropLocal() {
    engaging = null;
    if (engaged) engaged.classList.remove("tt-engaged");
    engaged = null;
    stopWatch();
  }
  async function engage(el) {
    if (engaged === el || engaging === el) return;
    engaging = el;
    let ok = false;
    try { ok = await tt.engage(); } catch {}
    if (engaging !== el) return; // a later click won
    engaging = null;
    if (!ok) return;
    if (!isTextField(el) || !shown(el)) { release(); return; }
    try { if (document.activeElement !== el) el.focus({ preventScroll: true }); } catch {}
    markEngaged(el);
  }
  function release() {
    dropLocal();
    tt.release().catch(() => {});
  }

  // While typing goes to a field: if it disappears, or the page empties it
  // (the text was sent), the typing is over.
  function startWatch() {
    stopWatch();
    watchTimer = setInterval(() => {
      const el = engaged;
      if (!el) { stopWatch(); return; }
      if (!isTextField(el) || !shown(el)) { release(); return; }
      const v = valueOf(el);
      if (lastValue && lastValue.trim() && !v.trim()) { release(); return; }
      lastValue = v;
    }, 250);
  }
  function stopWatch() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  }

  // A click on a text field takes the keyboard; a click anywhere else gives it
  // back. Only that click takes it: a button that focuses a field (a screen
  // opening with its first field focused, Edit opening an editor) does not,
  // because the other app still looks focused and the user would type there,
  // into Ace. A click on the field itself is needed. main gives the keys back
  // too when the user clicks another app or switches to one.
  document.addEventListener("mousedown", (e) => {
    if (!enabled || realFocus) return;
    try { capsLock = e.getModifierState("CapsLock"); } catch {}
    const field = textFieldAt(e.target);
    if (field) { engage(field); return; }
    release();
  }, true);

  // Text selected with the mouse outside a field: the next Ctrl+C (for a few
  // seconds) copies it, since Ctrl+C itself goes to the focused app.
  document.addEventListener("mouseup", () => {
    if (!enabled || realFocus || engaged) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString() : "";
      if (text.trim() && !isTextField(document.activeElement)) tt.selection(true).catch(() => {});
    }, 0);
  }, true);
  tt.onCopySelection(() => {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (text) tt.copyText(text).catch(() => {});
  });

  // ── Keys ────────────────────────────────────────────────────────────────────
  // main sends { key, shift, ctrl, alt } with key as an accelerator key name:
  // "A", "7", ";", "num5", "Space", "Enter", "Left"…
  const SHIFTED = {
    "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
    ";": ":", "=": "+", ",": "<", "-": "_", ".": ">", "/": "?", "`": "~", "[": "{", "\\": "|", "]": "}", "'": "\"",
  };
  const NUMPAD = {
    num0: "0", num1: "1", num2: "2", num3: "3", num4: "4", num5: "5", num6: "6", num7: "7", num8: "8", num9: "9",
    numdec: ".", numadd: "+", numsub: "-", nummult: "*", numdiv: "/",
  };
  const NAMED = {
    Enter: "Enter", Backspace: "Backspace", Delete: "Delete", Tab: "Tab", Escape: "Escape",
    Left: "ArrowLeft", Right: "ArrowRight", Up: "ArrowUp", Down: "ArrowDown", Home: "Home", End: "End",
  };
  const PUNCT_CODE = {
    ";": "Semicolon", "=": "Equal", ",": "Comma", "-": "Minus", ".": "Period", "/": "Slash",
    "`": "Backquote", "[": "BracketLeft", "\\": "Backslash", "]": "BracketRight", "'": "Quote",
  };
  const NUMPAD_CODE = { numdec: "NumpadDecimal", numadd: "NumpadAdd", numsub: "NumpadSubtract", nummult: "NumpadMultiply", numdiv: "NumpadDivide" };

  // The character the key types, or null for an editing key / Ctrl combo.
  function charOf(k) {
    if (k.ctrl || k.alt) return null;
    const key = k.key;
    if (key === "Space") return " ";
    if (NUMPAD[key]) return NUMPAD[key];
    if (key.length !== 1) return null;
    if (key >= "A" && key <= "Z") return (k.shift !== capsLock) ? key : key.toLowerCase();
    return k.shift ? (SHIFTED[key] || key) : key;
  }
  // KeyboardEvent.key for keys that type nothing.
  function keyNameOf(k) {
    const key = k.key;
    if (NAMED[key]) return NAMED[key];
    if (key === "Space") return " ";
    if (key.length === 1) {
      if (key >= "A" && key <= "Z") return k.shift ? key : key.toLowerCase();
      return k.shift ? (SHIFTED[key] || key) : key;
    }
    return NUMPAD[key] || key;
  }
  function codeOf(k) {
    const key = k.key;
    if (key.length === 1 && key >= "A" && key <= "Z") return "Key" + key;
    if (key.length === 1 && key >= "0" && key <= "9") return "Digit" + key;
    if (PUNCT_CODE[key]) return PUNCT_CODE[key];
    if (/^num[0-9]$/.test(key)) return "Numpad" + key.slice(3);
    if (NUMPAD_CODE[key]) return NUMPAD_CODE[key];
    if (key === "Left" || key === "Right" || key === "Up" || key === "Down") return "Arrow" + key;
    return key; // Space, Enter, Backspace, Delete, Tab, Escape, Home, End
  }

  function fireKey(target, type, key, code, k) {
    const ev = new KeyboardEvent(type, {
      key, code, shiftKey: !!k.shift, ctrlKey: !!k.ctrl, altKey: !!k.alt,
      bubbles: true, cancelable: true, composed: true, view: window,
    });
    target.dispatchEvent(ev);
    return ev;
  }

  tt.onKey((k) => {
    queue = queue.then(() => onKey(k)).catch(() => {});
  });

  async function onKey(k) {
    if (!enabled || realFocus) return;
    let el = engaged;
    const active = document.activeElement;
    // The page moved focus to another field (Tab, an editor it opened): follow it.
    if (active && active !== el && isTextField(active) && shown(active)) { markEngaged(active); el = active; }
    if (!el || !isTextField(el) || !shown(el)) { release(); return; }
    if (active !== el) { try { el.focus({ preventScroll: true }); } catch {} }
    // Ctrl+Alt is AltGr on many layouts; what it types is not known here, so
    // the key is only kept away from the other app.
    if (k.ctrl && k.alt) return;

    const ch = charOf(k);
    const key = ch !== null ? ch : keyNameOf(k);
    const code = codeOf(k);
    const before = valueOf(el);
    const down = fireKey(el, "keydown", key, code, k);
    if (!down.defaultPrevented) await defaultAction(el, key, ch, k);
    const upTarget = isTextField(document.activeElement) ? document.activeElement : el;
    if (upTarget.isConnected) fireKey(upTarget, "keyup", key, code, k);

    if (key === "Escape") { release(); return; }
    if (engaged !== el) return;
    // Enter handled by the page (it sends): leave lastValue as it was so the
    // watch notices the field being emptied, now or after an await.
    if (key === "Enter" && down.defaultPrevented) {
      lastValue = before;
      if (before.trim() && !valueOf(el).trim()) release();
    } else {
      lastValue = valueOf(el);
    }
  }

  async function defaultAction(el, key, ch, k) {
    if (ch !== null) { insertText(el, ch); return; }
    if (k.ctrl && key.length === 1) {
      const c = key.toLowerCase();
      if (c === "v") { await pasteInto(el); return; }      // Ctrl+V, Ctrl+Shift+V
      if (c === "z") { exec(k.shift ? "redo" : "undo"); return; }
      if (k.shift) return;
      if (c === "a") selectAll(el);
      else if (c === "c") copySelection(el, false);
      else if (c === "x") copySelection(el, true);
      else if (c === "y") exec("redo");
      return; // any other Ctrl+key: kept from the other app, does nothing here
    }
    switch (key) {
      case "Enter":
        if (k.ctrl) return; // Ctrl+Enter types nothing
        if (el.tagName === "TEXTAREA") insertText(el, "\n");
        else if (el.isContentEditable) exec("insertLineBreak");
        return;
      case "Backspace": deleteText(el, true, k.ctrl); return;
      case "Delete": deleteText(el, false, k.ctrl); return;
      case "Tab": if (!k.ctrl) moveFocus(el, k.shift); return;
      case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": case "Home": case "End":
        moveCaret(el, key, k.shift, k.ctrl); return;
    }
  }

  // ── Editing ─────────────────────────────────────────────────────────────────
  function exec(cmd, arg) {
    try { return document.execCommand(cmd, false, arg); } catch { return false; }
  }

  // Replace [s, e) of a textarea / text input with text, the way typing does:
  // through the editing command when it works (undo, scrolling, input events),
  // otherwise by hand.
  function editRange(el, s, e, text, inputType) {
    const v = el.value;
    if (text && el.maxLength >= 0) {
      const room = el.maxLength - (v.length - (e - s));
      if (room <= 0) return;
      text = text.slice(0, room);
    }
    const want = v.slice(0, s) + text + v.slice(e);
    if (want === v) { try { el.setSelectionRange(s + text.length, s + text.length); } catch {} return; }
    try { el.setSelectionRange(s, e); } catch {}
    const ok = text ? exec("insertText", text) : exec("delete");
    if (ok && el.value === want) return;
    if (el.value !== v) el.value = v;
    el.setRangeText(text, s, e, "end");
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: text || null }));
    if (el.selectionEnd === el.value.length) el.scrollTop = el.scrollHeight;
  }

  function insertText(el, text) {
    if (!text) return;
    if (el.isContentEditable) { exec("insertText", text); return; }
    if (hasCaret(el)) {
      if (el.tagName === "INPUT") text = text.replace(/\r?\n/g, " ");
      editRange(el, el.selectionStart, el.selectionEnd, text, "insertText");
      return;
    }
    // number / email input: no caret, so the text goes at the end.
    const v = el.value;
    if (exec("insertText", text) && el.value !== v) return;
    el.value = v + text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function deleteText(el, backward, word) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (word && sel && sel.isCollapsed && sel.modify) sel.modify("extend", backward ? "backward" : "forward", "word");
      exec(backward ? "delete" : "forwardDelete");
      return;
    }
    if (!hasCaret(el)) {
      const v = el.value;
      if (!backward || !v) return;
      if (exec("delete") && el.value !== v) return;
      el.value = v.slice(0, -1);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      return;
    }
    const v = el.value;
    let s = el.selectionStart, e = el.selectionEnd;
    if (s === e) {
      if (backward) s = word ? wordLeft(v, s) : prevIndex(v, s);
      else e = word ? wordRight(v, e) : nextIndex(v, e);
      if (s === e) return;
    }
    editRange(el, s, e, "", backward ? "deleteContentBackward" : "deleteContentForward");
  }

  function selectAll(el) {
    if (hasCaret(el)) { try { el.setSelectionRange(0, el.value.length); } catch {} return; }
    if (typeof el.select === "function") { el.select(); return; }
    exec("selectAll");
  }

  function selectedText(el) {
    if (hasCaret(el)) return el.value.slice(el.selectionStart, el.selectionEnd);
    const sel = window.getSelection();
    return sel ? sel.toString() : "";
  }
  function copySelection(el, cut) {
    if (el.type === "password") return; // never copied, as in any browser
    const text = selectedText(el);
    if (!text) return;
    tt.copyText(text).catch(() => {});
    if (!cut) return;
    if (hasCaret(el)) editRange(el, el.selectionStart, el.selectionEnd, "", "deleteByCut");
    else exec("delete");
  }

  // Ctrl+V: the page's paste handlers get a paste event with the clipboard
  // (an image pasted into the chat is sent as one); if none takes it, the text
  // is typed in.
  async function pasteInto(el) {
    let clip = { text: "", image: "" };
    try { clip = (await tt.readClipboard()) || clip; } catch {}
    if (engaged !== el || !el.isConnected) return;
    const dt = new DataTransfer();
    if (clip.text) dt.setData("text/plain", clip.text);
    if (clip.image) {
      const file = dataUrlToFile(clip.image, "image.png");
      if (file) { try { dt.items.add(file); } catch {} }
    }
    let ev = null;
    try { ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true, composed: true }); } catch {}
    if (ev) {
      el.dispatchEvent(ev);
      if (ev.defaultPrevented) return;
    }
    if (clip.text) insertText(el, clip.text.replace(/\r\n/g, "\n"));
  }
  function dataUrlToFile(url, name) {
    try {
      const comma = url.indexOf(",");
      const mime = (/^data:([^;,]+)/.exec(url) || [])[1] || "image/png";
      const bin = atob(url.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], name, { type: mime });
    } catch { return null; }
  }

  // Tab / Shift+Tab: the next / previous text field on the page.
  function moveFocus(el, back) {
    const fields = Array.from(document.querySelectorAll("textarea, input, [contenteditable]"))
      .filter((f) => isTextField(f) && shown(f) && f.tabIndex >= 0);
    const i = fields.indexOf(el);
    const next = i < 0 ? null : fields[back ? i - 1 : i + 1];
    if (!next) return;
    try { next.focus(); } catch {}
    if (hasCaret(next)) { try { next.setSelectionRange(0, next.value.length); } catch {} }
    markEngaged(next);
  }

  // ── Caret movement ──────────────────────────────────────────────────────────
  function isLow(c) { return c >= 0xdc00 && c <= 0xdfff; }
  function prevIndex(v, p) { return p >= 2 && isLow(v.charCodeAt(p - 1)) ? p - 2 : Math.max(0, p - 1); }
  function nextIndex(v, p) { return p < v.length && isLow(v.charCodeAt(p + 1)) ? p + 2 : Math.min(v.length, p + 1); }
  function wordLeft(v, p) {
    let i = p;
    while (i > 0 && /\s/.test(v[i - 1])) i--;
    while (i > 0 && !/\s/.test(v[i - 1])) i--;
    return i;
  }
  function wordRight(v, p) {
    let i = p;
    while (i < v.length && !/\s/.test(v[i])) i++;
    while (i < v.length && /\s/.test(v[i])) i++;
    return i;
  }
  function lineStart(v, p) { return v.lastIndexOf("\n", p - 1) + 1; }
  function lineEnd(v, p) { const i = v.indexOf("\n", p); return i < 0 ? v.length : i; }
  function lineUp(v, p) {
    const ls = lineStart(v, p);
    if (ls === 0) return 0;
    const ps = lineStart(v, ls - 1);
    return Math.min(ps + (p - ls), ls - 1);
  }
  function lineDown(v, p) {
    const le = lineEnd(v, p);
    if (le >= v.length) return v.length;
    const ns = le + 1;
    return Math.min(ns + (p - lineStart(v, p)), lineEnd(v, ns));
  }

  function moveCaret(el, key, shift, ctrl) {
    if (!hasCaret(el)) {
      if (!el.isContentEditable) return;
      const sel = window.getSelection();
      if (!sel || !sel.modify) return;
      const how = {
        ArrowLeft: ["backward", ctrl ? "word" : "character"], ArrowRight: ["forward", ctrl ? "word" : "character"],
        ArrowUp: ["backward", "line"], ArrowDown: ["forward", "line"],
        Home: ["backward", ctrl ? "documentboundary" : "lineboundary"], End: ["forward", ctrl ? "documentboundary" : "lineboundary"],
      }[key];
      if (how) sel.modify(shift ? "extend" : "move", how[0], how[1]);
      return;
    }
    const v = el.value;
    const s = el.selectionStart, e = el.selectionEnd;
    const backward = el.selectionDirection === "backward";
    const anchor = backward ? e : s;
    const focus = backward ? s : e;
    // Left / Right with a selection and no Shift: collapse to its edge.
    if (!shift && !ctrl && s !== e && (key === "ArrowLeft" || key === "ArrowRight")) {
      const p = key === "ArrowLeft" ? s : e;
      el.setSelectionRange(p, p);
      return;
    }
    const multiline = el.tagName === "TEXTAREA";
    let p = focus;
    switch (key) {
      case "ArrowLeft": p = ctrl ? wordLeft(v, p) : prevIndex(v, p); break;
      case "ArrowRight": p = ctrl ? wordRight(v, p) : nextIndex(v, p); break;
      case "ArrowUp": p = multiline ? lineUp(v, p) : 0; break;
      case "ArrowDown": p = multiline ? lineDown(v, p) : v.length; break;
      case "Home": p = (ctrl || !multiline) ? 0 : lineStart(v, p); break;
      case "End": p = (ctrl || !multiline) ? v.length : lineEnd(v, p); break;
    }
    if (shift) el.setSelectionRange(Math.min(anchor, p), Math.max(anchor, p), p < anchor ? "backward" : "forward");
    else el.setSelectionRange(p, p);
  }
})();
