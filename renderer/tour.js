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
    { screen: "welcome", target: "#historyBtn", title: "Session history",
      text: "The clock opens your past sessions: continue one where you left off, search by company or role, or delete them — one at a time, or all of them with Remove all." },
    { screen: "welcome", target: "#stealthBtn", title: "Staying invisible",
      text: "The eye is Stealth: a crossed-out green eye means the app is hidden from screen sharing and recordings (Windows). Next to it: click-through, the − button to hide the window, and × to quit. The red power icon next to them ends the interview. Bring a hidden window back with Ctrl+Alt+H or the round A button on your screen." },
    { screen: "welcome", target: "#themeBtn", title: "Light or dark",
      text: "The sun / moon switches Ace between the light and the dark theme. It remembers your choice." },
    { screen: "stage", target: 'details.stage-group[data-kind="hiring"] > summary', title: "Step 1 — what kind of call?",
      text: "Hiring interviews: you are applying for a job. Click it to see the calls — Recruiter / HR screen, Technical interview, Live coding, Leader round, AI interview. Every answer is written to fit the call you pick." },
    { screen: "stage", target: 'details.stage-group[data-kind="team"] > summary', title: "Team meetings",
      text: "Team meetings: standups, sprint reviews and planning, discussions at work. Answers are written as a teammate, and Ace shows who is speaking. No resume, job description or salary is needed for these." },
    { screen: "stage", target: "#stageNextBtn", title: "Pick, then go on",
      text: "The first click on a call picks it and shows what it is about. Click the same call again, or press Next, to go on." },
    { screen: "profile", target: "#profileOverlay .profile-inputs", title: "Step 2 — who you are",
      text: "Type your name and pick your country and city — the timezone fills in by itself. Answers speak as this person, and the info panel shows the local time and weather for this place." },
    { screen: "profile", target: ".profile-picker", title: "Your saved profiles",
      text: "Pick a saved profile from this list, or “New profile”. A new profile is kept for next time when you press Next. Change a saved one and a bar appears: Save keeps the change, Undo puts it back. The bin deletes the profile." },
    { screen: "materials", target: "#setupOverlay .upload-grid", title: "Step 3 — your materials",
      text: "For a hiring interview, drag your CV and the job description into these boxes (PDF, Word or text) — both are needed. Extra notes go into Support material. A team meeting only has Support material. Answers are built only from what you upload here." },
    { screen: "materials", target: "#setupOverlay .salary-block", hiringOnly: true, title: "Salary expectation",
      text: "Enter the amount, currency and whether it is per month, year or hour. When they ask, the app answers with this." },
    { screen: "materials", target: "#setupStartBtnV", title: "Start the interview",
      text: "Press Start interview. Listening begins by itself — you do not need to press anything else." },
    { screen: "interview", target: "#answerHistory", title: "Questions appear here",
      text: "What the interviewer says shows up as blue bubbles. When a question ends, your answer appears right under it. Each bubble has ↻ answer again, ✎ fix the words then answer, and × remove." },
    { screen: "interview", target: ".answer-composer", title: "Ask your own question",
      text: "Type here and press Enter to prepare an answer before they ask — for example \"Tell me about yourself\". It gets the same header and buttons as a transcript bubble." },
    { screen: "interview", target: "#modeSeg", title: "Answer format",
      text: "Text is the normal spoken answer. Choose Code for coding questions and Diagram for architecture questions. Double-click a code block or a diagram to open it in a window of its own; double-click any other answer to send it to the sticky note. The drop-down on the left switches the call type mid-interview." },
    { screen: "interview", target: "#recBtn", title: "Is it listening?",
      text: "This microphone is red and blinking while the app is listening. Click it to pause, click again to continue (Alt+C does the same)." },
    { screen: "interview", target: "#captureAreaBtn", title: "A question on the screen",
      text: "For a written test or a task shared on screen: this button captures an area you drag over (Alt+S), the one under it the whole screen (Alt+A). The picture is added to your question; press Send to get the answer." },
    { screen: "interview", target: "#endBtn", title: "Ending the call",
      text: "Press End when the interview is over. You return to the start screen; your profile stays saved for next time." },
    { screen: "welcome", target: null, title: "You're ready",
      text: "That is the whole flow: Interview mode → meeting type → profile → materials → Start. Tick the box below if you do not want to see this tour again; you can replay it any time from the welcome screen, and the written guide is in Settings." },
  ];

  let i = 0;
  let active = false;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function place(step) {
    let target = step.target ? document.querySelector(step.target) : null;
    if (target && !target.getClientRects().length) target = null; // not shown now: card in the middle
    const vw = window.innerWidth, vh = window.innerHeight;
    const M = 12;
    const cardW = Math.min(330, vw - 2 * M);
    card.style.width = cardW + "px";
    card.style.maxHeight = "";
    if (!target) {
      spot.hidden = true;
      const cardH = card.offsetHeight;
      card.style.left = Math.round((vw - cardW) / 2) + "px";
      card.style.top = Math.round(clamp((vh - cardH) / 2, M, vh - cardH - M)) + "px";
      return;
    }
    // Scroll the control into view first: to the top when it is tall, so the
    // card can sit below it without hiding it.
    let r = target.getBoundingClientRect();
    const tall = r.height > vh * 0.5;
    try { target.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest" }); } catch {}
    r = target.getBoundingClientRect();
    spot.hidden = false;
    spot.style.left = (r.left - 6) + "px";
    spot.style.top = (r.top - 6) + "px";
    spot.style.width = (r.width + 12) + "px";
    spot.style.height = (r.height + 12) + "px";

    // Pick the side with more free space and never cover the control:
    // the card shrinks (and scrolls inside) to fit the space it is given.
    const spaceBelow = vh - r.bottom - 8 - M;
    const spaceAbove = r.top - 8 - M;
    const natural = card.offsetHeight;
    const MIN_CARD = 150;
    let top;
    if (spaceBelow >= natural) {
      top = r.bottom + 8;
    } else if (spaceAbove >= natural) {
      top = r.top - 8 - natural;
    } else if (Math.max(spaceBelow, spaceAbove) >= MIN_CARD) {
      const below = spaceBelow >= spaceAbove;
      card.style.maxHeight = (below ? spaceBelow : spaceAbove) + "px";
      const h = card.offsetHeight;
      top = below ? r.bottom + 8 : r.top - 8 - h;
    } else {
      // Control fills the window: pin the card to the bottom edge, capped to
      // 40% of the height, so the upper part of the control stays visible.
      card.style.maxHeight = Math.round(vh * 0.4) + "px";
      top = vh - M - card.offsetHeight;
    }
    card.style.top = Math.round(top) + "px";
    card.style.left = Math.round(clamp(r.left, M, vw - cardW - M)) + "px";
  }

  // The steps for the meeting type picked now: a team meeting has no salary.
  let steps = STEPS;
  function pickSteps() {
    const hiring = document.body.classList.contains("meeting-hiring");
    steps = STEPS.filter((s) => !s.hiringOnly || hiring);
  }

  function render() {
    const step = steps[i];
    SCREENS[step.screen]();
    elTitle.textContent = step.title;
    elText.textContent = step.text;
    elStep.textContent = (i + 1) + " / " + steps.length;
    btnBack.disabled = i === 0;
    btnNext.textContent = i === steps.length - 1 ? "Finish" : "Next →";
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
  function onResize() { if (active) place(steps[i]); }

  btnNext.addEventListener("click", () => { if (i >= steps.length - 1) finish(); else { i++; render(); } });
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
    pickSteps();
    // The tour must be clickable: make sure click-through is off.
    if (window.api.setClickThrough) window.api.setClickThrough(false).catch(() => {});
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
