// First-run tour: dims the app, spotlights one control at a time and explains
// it in plain words, walking through the real screens (welcome → stage →
// profile → materials → interview). It shows on every start until the user
// ticks "Don't show this again" (state.welcomeSeen), and can be replayed
// from the welcome screen. Loaded after renderer.js: it drives the same
// showStage / showProfile / showSetup / hideSetup functions the app uses.
(function () {
  const root = document.getElementById("tour");
  if (!root || !window.api) return;
  const spot = root.querySelector(".tour-spot");
  const card = root.querySelector(".tour-card");
  const elTitle = root.querySelector(".tour-title");
  const elText = root.querySelector(".tour-text");
  const elStep = root.querySelector(".tour-step");
  const btnBack = root.querySelector(".tour-back");
  const btnNext = root.querySelector(".tour-next");
  const btnSkip = root.querySelector(".tour-skip");
  const chk = root.querySelector("#tourDontShow");

  // Which app screen each step lives on, and how to get there.
  const SCREENS = {
    welcome: () => showModeSelect(),
    stage: () => showStage(),
    profile: () => showProfile(),
    materials: () => showSetup(),
    // Preview of the interview screen without starting a session or listening.
    interview: () => { showSetup(); hideSetup(); },
  };

  const STEPS = [
    { screen: "welcome", target: "#modeNewBtn", title: "Start here",
      text: "When you are about to have an interview, click Interview mode. The next three screens prepare your answers — it takes about a minute." },
    { screen: "welcome", target: "#modeSelectSettingsBtn", title: "Settings and guide",
      text: "The gear opens Settings: which audio to listen to, hotkeys, and the written user guide you can read any time." },
    { screen: "welcome", target: "#stealthBtn", title: "Staying invisible",
      text: "The shield is Stealth: when it is green the app is hidden from screen sharing and recordings (Windows). Next to it: click-through, the − button to hide the window, and × to quit. Bring a hidden window back with Ctrl+Alt+H or the round A button on your screen." },
    { screen: "stage", target: ".stage-cards", title: "Step 1 — what kind of call?",
      text: "Pick Intro, Technical, HR or CEO. This changes how every answer is written: simple and friendly for a recruiter, precise and factual for engineers, ownership and leadership for HR and CEO. Then press Next." },
    { screen: "profile", target: ".profile-inputs", title: "Step 2 — who you are",
      text: "Type your name and pick your country and city — the timezone fills in by itself. Answers speak as this person, and the info panel shows the local time and weather for this place." },
    { screen: "profile", target: ".profile-picker", title: "Save your profile",
      text: "Press ＋ to save these details under a name. Next time just pick it from the list. ⟳ updates the selected profile, 🗑 deletes it." },
    { screen: "materials", target: ".upload-grid", title: "Step 3 — your materials",
      text: "Drag your CV and the job description into these boxes (PDF, Word or text). Extra notes go into Support material; notes from earlier rounds into Previous meeting records. Answers are built only from what you upload here." },
    { screen: "materials", target: ".salary-block", title: "Salary expectation (optional)",
      text: "If they might ask, enter the amount, currency and whether it is per month, year or hour. The app will answer that question the way you want." },
    { screen: "materials", target: "#setupStartBtnV", title: "Start the interview",
      text: "Press Start interview. Listening begins by itself — you do not need to press anything else." },
    { screen: "interview", target: "#answerHistory", title: "Questions appear here",
      text: "What the interviewer says shows up as blue bubbles. When a question ends, your answer appears right under it. Each bubble has ↻ answer again, ✎ fix the words then answer, and × remove." },
    { screen: "interview", target: ".answer-composer", title: "Ask your own question",
      text: "Type here and press Enter to prepare an answer before they ask — for example \"Tell me about yourself\". It gets the same header and buttons as a transcript bubble." },
    { screen: "interview", target: "#modeSeg", title: "Answer format",
      text: "Text is the normal spoken answer. Choose Code for coding questions and Diagram for architecture questions. The drop-down on the left switches the call type mid-interview." },
    { screen: "interview", target: "#recBtn", title: "Is it listening?",
      text: "This microphone is red and blinking while the app is listening. Click it to pause, click again to continue (Alt+C does the same)." },
    { screen: "interview", target: "#modeToggleBtn", title: "Voice or screen",
      text: "The waveform means the app listens to the call audio (normal). Switch to the scan icon to read text from an area of your screen instead — useful for written tests." },
    { screen: "interview", target: "#endBtn", title: "Ending the call",
      text: "Press End when the interview is over. You return to the start screen; your profile stays saved for next time." },
    { screen: "welcome", target: null, title: "You're ready",
      text: "That is the whole flow: Interview mode → call type → profile → materials → Start. Tick the box below if you do not want to see this tour again; you can replay it any time from the welcome screen, and the written guide is in Settings." },
  ];

  let i = 0;
  let active = false;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function place(step) {
    const target = step.target ? document.querySelector(step.target) : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const cardW = Math.min(330, vw - 24);
    card.style.width = cardW + "px";
    const cardH = card.offsetHeight;
    if (!target) {
      spot.hidden = true;
      card.style.left = Math.round((vw - cardW) / 2) + "px";
      card.style.top = Math.round(clamp((vh - cardH) / 2, 12, vh - cardH - 12)) + "px";
      return;
    }
    try { target.scrollIntoView({ block: "center", inline: "nearest" }); } catch {}
    const r = target.getBoundingClientRect();
    spot.hidden = false;
    spot.style.left = (r.left - 6) + "px";
    spot.style.top = (r.top - 6) + "px";
    spot.style.width = (r.width + 12) + "px";
    spot.style.height = (r.height + 12) + "px";
    const below = r.bottom + 12;
    const above = r.top - 12 - cardH;
    let top;
    if (below + cardH <= vh - 12) top = below;
    else if (above >= 12) top = above;
    else top = clamp((vh - cardH) / 2, 12, vh - cardH - 12);
    card.style.top = Math.round(top) + "px";
    card.style.left = Math.round(clamp(r.left, 12, vw - cardW - 12)) + "px";
  }

  function render() {
    const step = STEPS[i];
    SCREENS[step.screen]();
    elTitle.textContent = step.title;
    elText.textContent = step.text;
    elStep.textContent = (i + 1) + " / " + STEPS.length;
    btnBack.disabled = i === 0;
    btnNext.textContent = i === STEPS.length - 1 ? "Finish" : "Next →";
    // Let the screen switch paint before measuring the target.
    requestAnimationFrame(() => setTimeout(() => place(step), 80));
  }

  function finish() {
    if (!active) return;
    active = false;
    root.hidden = true;
    window.removeEventListener("resize", onResize);
    showModeSelect();
  }
  function onResize() { if (active) place(STEPS[i]); }

  btnNext.addEventListener("click", () => { if (i >= STEPS.length - 1) finish(); else { i++; render(); } });
  btnBack.addEventListener("click", () => { if (i > 0) { i--; render(); } });
  btnSkip.addEventListener("click", finish);
  document.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.key === "Escape") { e.preventDefault(); finish(); }
    else if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); btnNext.click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); btnBack.click(); }
  });
  chk.addEventListener("change", () => { window.api.setWelcomeSeen(chk.checked).catch(() => {}); });

  window.startTour = function startTour() {
    i = 0;
    active = true;
    root.hidden = false;
    window.api.getWelcomeSeen().then((seen) => { chk.checked = !!seen; }).catch(() => {});
    window.addEventListener("resize", onResize);
    render();
  };
  const replay = document.getElementById("welcomeTourBtn");
  if (replay) replay.addEventListener("click", () => window.startTour());

  // First start: run the tour until "Don't show this again" has been ticked.
  window.api.getWelcomeSeen().then((seen) => { if (!seen) setTimeout(window.startTour, 500); }).catch(() => {});
})();
