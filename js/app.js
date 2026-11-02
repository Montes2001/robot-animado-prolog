/* ============================================================
   NEO-BOT · puente entre la interfaz y el cerebro en Prolog
   - prolog/robot.pl contiene hechos y reglas (reconocer, validar, mover)
   - Este archivo SOLO consulta a Prolog y anima los eventos devueltos
   ============================================================ */
(() => {
  "use strict";

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let speed = 1;
  const T = () => 1 / speed;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * T()));

  const COLORS = {
    cian: "#00f0ff", magenta: "#ff2bd6", lima: "#b6ff00",
    amarillo: "#ffe600", naranja: "#ff7a1a", violeta: "#9d4dff",
  };

  const robot = $("robot");
  const toastEl = $("toast");
  const consoleEl = $("console");
  const programEl = $("program");
  const mirrorEl = $("editor-hl");

  /* ============================================================
     1. PUENTE CON TAU PROLOG
     ============================================================ */
  const session = pl.create(500000);
  let queryChain = Promise.resolve();

  const fmtErr = (e) => {
    try { return session.format_answer(e).replace(/^uncaught exception: /, ""); }
    catch (_) { return String(e); }
  };

  function toJS(t) {
    if (t === null || t === undefined) return null;
    if (pl.type.is_number(t)) return t.value;
    if (pl.type.is_variable(t)) return "_";
    if (pl.type.is_term(t)) {
      if (t.indicator === "[]/0") return [];
      if (t.indicator === "./2") {
        const out = [];
        let p = t;
        while (p.indicator === "./2") { out.push(toJS(p.args[0])); p = p.args[1]; }
        return out;
      }
      if (t.args.length === 0) return t.id;
      return { f: t.id, a: t.args.map(toJS) };
    }
    return String(t);
  }

  const Prolog = {
    consult(text) {
      return new Promise((ok, ko) => session.consult(text, { success: ok, error: ko }));
    },
    /* Ejecuta una consulta y devuelve hasta `max` respuestas (serializado). */
    ask(goal, max = 1) {
      const run = () => new Promise((resolve) => {
        const out = { answers: [], error: null };
        const next = () => session.answer({
          success: (a) => {
            out.answers.push({ text: session.format_answer(a), sub: a });
            if (out.answers.length >= max) resolve(out); else next();
          },
          fail: () => resolve(out),
          error: (e) => { out.error = fmtErr(e); resolve(out); },
          limit: () => { out.error = "límite de inferencias excedido"; resolve(out); },
        });
        session.query(goal, {
          success: next,
          error: (e) => { out.error = fmtErr(e); resolve(out); },
        });
      });
      const p = queryChain.then(run);
      queryChain = p.catch(() => {});
      return p;
    },
  };

  /* ============================================================
     2. ESCENARIO (suelo en perspectiva + estrellas)
     ============================================================ */
  const NS = "http://www.w3.org/2000/svg";
  const G = { cx: 450, yTop: 252, yBot: 500, wTop: 380, wBot: 880, cols: 9, rows: 5 };
  const wAt = (v) => G.wTop + ((G.wBot - G.wTop) * v) / G.rows;
  const yAt = (v) => G.yTop + ((G.yBot - G.yTop) * v) / G.rows;
  const xAt = (v, c) => G.cx + ((c - G.cols / 2) * wAt(v)) / G.cols;

  function svgEl(name, attrs) {
    const el = document.createElementNS(NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function drawStage() {
    const wExt = G.wTop + ((G.wBot - G.wTop) * (520 - G.yTop)) / (G.yBot - G.yTop);
    $("floor").setAttribute("points",
      `${G.cx - G.wTop / 2},${G.yTop} ${G.cx + G.wTop / 2},${G.yTop} ${G.cx + wExt / 2},520 ${G.cx - wExt / 2},520`);

    const grid = $("grid");
    grid.innerHTML = "";
    for (let c = 0; c <= G.cols; c++) {
      grid.appendChild(svgEl("line", {
        x1: xAt(0, c), y1: yAt(0), x2: xAt(G.rows, c), y2: yAt(G.rows),
        class: c === 0 || c === G.cols ? "edge" : "",
      }));
    }
    for (let r = 0; r <= G.rows; r++) {
      grid.appendChild(svgEl("line", {
        x1: xAt(r, 0), y1: yAt(r), x2: xAt(r, G.cols), y2: yAt(r),
        class: r === 0 || r === G.rows ? "edge" : "",
      }));
    }
  }

  function drawStars() {
    const g = $("stars");
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 55; i++) {
      const c = svgEl("circle", { cx: rnd() * 900, cy: rnd() * 215, r: 0.5 + rnd() * 1.3 });
      c.style.animationDelay = `${(rnd() * 3).toFixed(2)}s`;
      c.style.animationDuration = `${(2 + rnd() * 3).toFixed(2)}s`;
      g.appendChild(c);
    }
  }

  function placeRobot(x, y) {
    const v = y + 0.5;
    const w = wAt(v);
    const s = (w / G.wBot) * 1.2;
    robot.style.transform = `translate(${xAt(v, x + 0.5)}px, ${yAt(v)}px) scale(${s})`;
  }

  /* ============================================================
     3. ANIMACIONES DEL ROBOT (reaccionan a eventos de Prolog)
     ============================================================ */
  async function flash(cls, ms) {
    robot.classList.remove(cls);
    void robot.getBoundingClientRect(); // reinicia la animacion CSS
    robot.classList.add(cls);
    await wait(ms);
    robot.classList.remove(cls);
  }

  let toastTimer = null;
  function toast(msg, kind = "", ms = 2400) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = `toast show ${kind}`;
    if (ms) toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  const lean = (dx, dy) => {
    robot.classList.remove("lean-l", "lean-r", "lean-f", "lean-b");
    if (dx > 0) robot.classList.add("lean-r");
    else if (dx < 0) robot.classList.add("lean-l");
    else if (dy > 0) robot.classList.add("lean-f");
    else if (dy < 0) robot.classList.add("lean-b");
  };

  const ERRORS = {
    motor_apagado: "Motor apagado · usa «encender»",
    sin_bateria: "Batería insuficiente · usa «cargar»",
    ya_encendido: "El robot ya está encendido",
    ya_apagado: "El robot ya está apagado",
    bateria_llena: "La batería ya está al 100 %",
  };

  function errorMessage(arg) {
    if (typeof arg === "string") return ERRORS[arg] || arg;
    if (arg && arg.f === "choque") return "¡Choque contra el borde del tablero!";
    if (arg && arg.f === "desconocida") return `Instrucción desconocida: ${term2s(arg.a[0])}`;
    return term2s(arg);
  }

  function term2s(t) {
    if (Array.isArray(t)) return `[${t.map(term2s).join(",")}]`;
    if (t && typeof t === "object") return `${t.f}(${t.a.map(term2s).join(",")})`;
    return String(t);
  }

  async function animate(ev) {
    switch (ev.f) {
      case "mover": {
        const [x0, y0, x, y] = ev.a;
        lean(x - x0, y - y0);
        robot.classList.add("walking");
        placeRobot(x, y);
        setPos(x, y);
        await wait(470);
        robot.classList.remove("walking");
        break;
      }
      case "gesto":
        lean(0, 0);
        if (ev.a[0] === "saltar") { await flash("jumping", 820); }
        else if (ev.a[0] === "saludar") { await flash("waving", 1520); }
        else if (ev.a[0] === "bailar") { await flash("dancing", 2250); }
        else if (ev.a[0] === "girar") { await flash("spinning", 1020); }
        break;
      case "motor":
        lean(0, 0);
        if (ev.a[0] === "encendido") {
          robot.classList.remove("off");
          setMotor("encendido");
          await flash("booting", 820);
        } else {
          robot.classList.add("off");
          setMotor("apagado");
          await wait(450);
        }
        break;
      case "pintar":
        setColor(ev.a[0]);
        await wait(500);
        break;
      case "carga":
        $("hud").querySelector(".hud-battery").classList.add("charging");
        await flash("charging", 1500);
        $("hud").querySelector(".hud-battery").classList.remove("charging");
        break;
      case "error": {
        lean(0, 0);
        const arg = ev.a[0];
        toast(errorMessage(arg), "err", 3200);
        if (arg && arg.f === "choque") {
          robot.style.setProperty("--bx", arg.a[0]);
          robot.style.setProperty("--by", arg.a[1]);
          await flash("bump", 520);
        } else {
          await flash("deny", 520);
        }
        break;
      }
      default: break;
    }
  }

  async function play(events) {
    for (const ev of events) {
      if (state.abort) break;
      await animate(ev);
    }
    lean(0, 0);
  }

  /* ============================================================
     4. HUD
     ============================================================ */
  function setPos(x, y) { $("hud-pos").textContent = `X${x} · Y${y}`; }
  function setMotor(m) {
    $("hud-motor").textContent = m;
    $("hud-led").classList.toggle("on", m === "encendido");
  }
  function setColor(c) {
    const hex = COLORS[c] || COLORS.cian;
    robot.style.setProperty("--c", hex);
    $("hud-color").textContent = c;
    $("hud-swatch").style.background = hex;
    $("hud-swatch").style.boxShadow = `0 0 12px ${hex}`;
  }
  function setBattery(b) {
    const bar = $("hud-bat");
    bar.style.width = `${b}%`;
    bar.classList.toggle("mid", b <= 50 && b > 20);
    bar.classList.toggle("low", b <= 20);
    $("hud-bat-num").textContent = `${b}%`;
  }

  /* Lee el estado real desde Prolog y lo refleja en la interfaz. */
  async function syncFromProlog() {
    const r = await Prolog.ask("estado(X,Y,B,M,C).");
    if (!r.answers.length) return;
    const s = r.answers[0].sub;
    const [x, y, b, m, c] = ["X", "Y", "B", "M", "C"].map((v) => toJS(s.lookup(v)));
    placeRobot(x, y);
    setPos(x, y);
    setBattery(b);
    setMotor(m);
    robot.classList.toggle("off", m !== "encendido");
    setColor(c);
  }

  /* ============================================================
     5. CONSOLA
     ============================================================ */
  function log(kind, text) {
    const d = document.createElement("div");
    d.className = `l ${kind}`;
    d.textContent = text;
    consoleEl.appendChild(d);
    while (consoleEl.children.length > 400) consoleEl.removeChild(consoleEl.firstChild);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  /* ============================================================
     6. CODIGO FUENTE PROLOG (visor con resaltado)
     ============================================================ */
  let srcLines = [];

  function highlightProlog(line) {
    const i = line.indexOf("%");
    const code = i >= 0 ? line.slice(0, i) : line;
    const com = i >= 0 ? line.slice(i) : "";
    const html = esc(code).replace(
      /(:-|-&gt;|\\\+|=&lt;|&gt;=|\\=)|\b([A-Z_][A-Za-z0-9_]*)\b|\b(\d+)\b|\b([a-z][a-zA-Z0-9_]*)(?=\()|(!)/g,
      (m, op, v, n, p, cut) => {
        if (op) return `<span class="tk-o">${op}</span>`;
        if (v) return `<span class="tk-v">${v}</span>`;
        if (n) return `<span class="tk-n">${n}</span>`;
        if (p) return `<span class="tk-p">${p}</span>`;
        if (cut) return `<span class="tk-o">!</span>`;
        return m;
      });
    return html + (com ? `<span class="tk-c">${esc(com)}</span>` : "");
  }

  function renderSource(text) {
    srcLines = text.replace(/\r/g, "").split("\n");
    if (srcLines[srcLines.length - 1] === "") srcLines.pop();
    $("source").innerHTML = srcLines
      .map((l) => `<span class="sl">${highlightProlog(l) || " "}</span>`)
      .join("");
  }

  /* Resalta en el visor la clausula usada y la cita en la consola. */
  function flashSource(needle, label) {
    const idx = srcLines.findIndex((l) => l.includes(needle));
    if (idx < 0) return;
    const box = $("source");
    const el = box.children[idx];
    box.querySelectorAll(".flash").forEach((n) => n.classList.remove("flash"));
    el.classList.add("flash");
    box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 2 + 20), behavior: "smooth" });
    setTimeout(() => el.classList.remove("flash"), 2600);
    log("h", `% ${label}: ${srcLines[idx].trim()}`);
  }

  function hintForCommand(term) {
    const m = /^([a-z][a-zA-Z0-9_]*)(?:\((.*)\))?$/.exec(term);
    if (!m) return;
    const [, name, args] = m;
    if (!args) flashSource(`instruccion(${name},`, "hecho usado");
    else if (name === "color") flashSource("reconocer(color(C)", "regla usada");
    else if (name === "repetir") flashSource("reconocer(repetir(N", "regla usada");
    else if (name === "rutina") flashSource(`rutina(${args.trim()},`, "hecho usado");
  }

  const ERR_NEEDLES = {
    motor_apagado: "bloqueada(Accion, motor_apagado)",
    sin_bateria: "bloqueada(Accion, sin_bateria)",
    ya_encendido: "ya_encendido) :-",
    ya_apagado: "ya_apagado)",
    bateria_llena: "bateria_llena)",
  };

  function hintForError(arg) {
    if (typeof arg === "string" && ERR_NEEDLES[arg]) flashSource(ERR_NEEDLES[arg], "regla que lo impide");
    else if (arg && arg.f === "choque") flashSource("bloqueada(mover(DX, DY), choque", "regla que lo impide");
    else if (arg && arg.f === "desconocida") flashSource("[error(desconocida(Cmd))]", "regla de respaldo");
  }

  /* ============================================================
     7. EJECUCION DE INSTRUCCIONES
     ============================================================ */
  const state = { running: false, abort: false, pc: 0, pending: 0 };

  const cleanLine = (raw) => raw.replace(/%.*$/, "").trim().replace(/\.\s*$/, "").trim();

  /* Solo se aceptan terminos unicos: evita inyectar objetivos Prolog. */
  function isSingleTerm(s) {
    if (!/^[a-z][a-zA-Z0-9_]*(\(.*\))?$/.test(s)) return false;
    if (/['"`;|\\]/.test(s)) return false;
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "(") d++;
      else if (ch === ")") {
        d--;
        if (d < 0 || (d === 0 && i < s.length - 1)) return false;
      } else if (ch === "," && d === 0) return false;
    }
    return d === 0;
  }

  let lock = Promise.resolve();
  const exclusive = (fn) => {
    const p = lock.then(fn);
    lock = p.catch(() => {});
    return p;
  };

  /* Devuelve true si la instruccion se ejecuto sin errores. */
  async function execute(raw) {
    const term = cleanLine(raw);
    if (!isSingleTerm(term)) {
      log("q", `?- ejecutar(${term}, E).`);
      log("e", "Instrucción mal formada. Usa un solo término, p. ej. adelante  ó  repetir(3, derecha)");
      toast("Instrucción mal formada", "err");
      return false;
    }
    const goal = `ejecutar(${term}, E).`;
    log("q", `?- ${goal}`);
    const r = await Prolog.ask(goal);
    if (r.error) { log("e", r.error); toast("Error de Prolog", "err"); return false; }
    if (!r.answers.length) { log("e", "false."); return false; }

    log("a", r.answers[0].text);
    hintForCommand(term);
    const events = toJS(r.answers[0].sub.lookup("E")) || [];
    const errors = events.filter((e) => e.f === "error");
    await play(events);
    errors.forEach((e) => hintForError(e.a[0]));
    await syncFromProlog();
    return errors.length === 0;
  }

  async function resetRobot(announce = true) {
    await Prolog.ask("reiniciar.");
    if (announce) { log("q", "?- reiniciar."); log("a", "true."); }
    await syncFromProlog();
    if (announce) toast("Robot reiniciado · apagado y listo", "ok");
  }

  /* ---------- Programa (editor) ---------- */
  const lineState = new Map();
  let badLines = new Set();

  function programLines() {
    return programEl.value.split("\n")
      .map((text, idx) => ({ idx, text: cleanLine(text) }))
      .filter((l) => l.text && !programEl.value.split("\n")[l.idx].trim().startsWith("%"));
  }

  function renderMirror() {
    const rows = programEl.value.split("\n");
    mirrorEl.innerHTML = rows.map((raw, i) => {
      const cls = ["ln"];
      const t = raw.trim();
      if (t.startsWith("%")) cls.push("comment");
      else if (badLines.has(i)) cls.push("bad");
      if (lineState.has(i)) cls.push(lineState.get(i));
      return `<div class="${cls.join(" ")}">${esc(raw) || " "}</div>`;
    }).join("");
    mirrorEl.scrollTop = programEl.scrollTop;
    mirrorEl.scrollLeft = programEl.scrollLeft;
  }

  function setLine(idx, cls) {
    if (cls) lineState.set(idx, cls); else lineState.delete(idx);
    renderMirror();
    const row = mirrorEl.children[idx];
    if (row) {
      const top = row.offsetTop, bottom = top + row.offsetHeight;
      if (top < programEl.scrollTop) programEl.scrollTop = top - 6;
      else if (bottom > programEl.scrollTop + programEl.clientHeight) programEl.scrollTop = bottom - programEl.clientHeight + 6;
      mirrorEl.scrollTop = programEl.scrollTop;
    }
  }

  let validateToken = 0;
  async function validateProgram() {
    const token = ++validateToken;
    const bad = new Set();
    const rows = programEl.value.split("\n");
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].trim().startsWith("%")) continue;
      const t = cleanLine(rows[i]);
      if (!t) continue;
      if (!isSingleTerm(t)) { bad.add(i); continue; }
      const r = await Prolog.ask(`reconocer(${t}, _).`);
      if (token !== validateToken) return;
      if (r.error || !r.answers.length) bad.add(i);
    }
    if (token !== validateToken) return;
    badLines = bad;
    renderMirror();
  }

  let validateTimer = null;
  function onProgramEdit() {
    state.pc = 0;
    lineState.clear();
    renderMirror();
    $("prog-status").textContent = "editando";
    clearTimeout(validateTimer);
    validateTimer = setTimeout(validateProgram, 280);
  }

  function setBusy(b) {
    state.running = b;
    $("btn-run").disabled = b;
    $("btn-step").disabled = b;
    $("btn-reset").disabled = b;
    $("btn-stop").disabled = !b;
    programEl.readOnly = b;
    document.querySelectorAll(".chip").forEach((c) => { c.disabled = b && c.dataset.mode !== "add"; });
  }

  async function runProgram(stepOnly = false) {
    if (state.running) return;
    const lines = programLines();
    if (!lines.length) { toast("El programa está vacío", "err"); return; }

    state.abort = false;
    setBusy(true);
    if (state.pc === 0 || state.pc >= lines.length) {
      state.pc = 0;
      lineState.clear();
      renderMirror();
      await resetRobot(false);
      log("i", "% — inicio del programa (robot reiniciado) —");
    }

    let failed = false;
    while (state.pc < lines.length && !state.abort) {
      const L = lines[state.pc];
      setLine(L.idx, "current");
      $("prog-status").textContent = `línea ${L.idx + 1} · ${state.pc + 1}/${lines.length}`;
      const ok = await exclusive(() => execute(L.text));
      setLine(L.idx, ok ? "done" : "fail");
      if (!ok) { failed = true; break; }
      state.pc++;
      if (stepOnly) break;
      await wait(150);
    }

    if (failed) {
      $("prog-status").textContent = "detenido por error";
      log("i", "% programa detenido: una regla de Prolog rechazó la instrucción");
      state.pc = 0;
    } else if (state.abort) {
      $("prog-status").textContent = "detenido";
      state.pc = 0;
    } else if (state.pc >= lines.length) {
      $("prog-status").textContent = "programa terminado ✓";
      toast("Programa terminado ✓", "ok");
      log("i", "% — fin del programa —");
    }
    setBusy(false);
  }

  /* ============================================================
     8. CONTROLES: chips, teclado, consulta libre
     ============================================================ */
  const GROUPS = [
    { title: "Movimiento", cls: "", items: ["adelante", "atras", "izquierda", "derecha"] },
    { title: "Acciones", cls: "act", items: ["saltar", "saludar", "bailar", "girar"] },
    { title: "Sistema", cls: "sys", items: ["encender", "apagar", "cargar"] },
    { title: "Colores", cls: "col", items: Object.keys(COLORS), fmt: (c) => `color(${c})` },
    { title: "Rutinas guardadas", cls: "rut", items: ["cuadrado", "zigzag", "saludo", "patrulla", "fiesta"], fmt: (n) => `rutina(${n})` },
    { title: "Repetir", cls: "", items: ["repetir(3, derecha)", "repetir(2, adelante)", "repetir(4, saltar)"] },
  ];

  let mode = "run";

  function buildChips() {
    const wrap = $("chips");
    GROUPS.forEach((g) => {
      const box = document.createElement("div");
      box.className = "chip-group";
      box.innerHTML = `<h3>${g.title}</h3><div class="chip-row"></div>`;
      const row = box.querySelector(".chip-row");
      g.items.forEach((it) => {
        const cmd = g.fmt ? g.fmt(it) : it;
        const b = document.createElement("button");
        b.type = "button";
        b.className = `chip ${g.cls}`;
        b.dataset.cmd = cmd;
        b.title = cmd;
        b.id = `chip-${cmd.replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "")}`;
        if (g.cls === "col") {
          b.style.setProperty("--sw", COLORS[it]);
          b.innerHTML = `<i></i>${it}`;
        } else {
          b.textContent = it;
        }
        b.addEventListener("click", () => onChip(cmd));
        row.appendChild(b);
      });
      wrap.appendChild(box);
    });
  }

  function onChip(cmd) {
    if (mode === "add") {
      const v = programEl.value;
      programEl.value = v + (v && !v.endsWith("\n") ? "\n" : "") + cmd + "\n";
      programEl.scrollTop = programEl.scrollHeight;
      onProgramEdit();
      toast(`Añadido: ${cmd}`, "ok", 1400);
      return;
    }
    if (state.running || state.pending >= 4) return;
    state.pending++;
    state.abort = false;
    exclusive(() => execute(cmd)).finally(() => { state.pending--; });
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  }

  const KEYS = { ArrowUp: "atras", ArrowDown: "adelante", ArrowLeft: "izquierda", ArrowRight: "derecha", " ": "saltar" };
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input" || e.ctrlKey || e.metaKey || e.altKey) return;
    const cmd = KEYS[e.key];
    if (!cmd) return;
    e.preventDefault();
    if (!e.repeat) onChip(cmd);
  });

  /* ---------- Consulta libre ---------- */
  const history = [];
  let histPos = 0;
  $("query-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("query-input");
    let q = input.value.trim();
    if (!q) return;
    history.push(q);
    histPos = history.length;
    input.value = "";
    if (!q.endsWith(".")) q += ".";
    log("q", `?- ${q}`);
    const r = await exclusive(() => Prolog.ask(q, 6));
    r.answers.forEach((a) => log("a", a.text));
    if (r.error) log("e", r.error);
    else if (!r.answers.length) log("e", "false.");
    await exclusive(syncFromProlog);
  });
  $("query-input").addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && histPos > 0) { histPos--; e.target.value = history[histPos]; e.preventDefault(); }
    else if (e.key === "ArrowDown" && histPos < history.length) { histPos++; e.target.value = history[histPos] || ""; e.preventDefault(); }
  });

  /* ---------- Botones ---------- */
  $("btn-run").addEventListener("click", () => { state.pc = 0; runProgram(false); });
  $("btn-step").addEventListener("click", () => runProgram(true));
  $("btn-stop").addEventListener("click", () => { state.abort = true; });
  $("btn-reset").addEventListener("click", () => {
    state.pc = 0;
    lineState.clear();
    renderMirror();
    $("prog-status").textContent = "listo";
    exclusive(() => resetRobot(true));
  });
  $("btn-clear-console").addEventListener("click", () => { consoleEl.innerHTML = ""; });
  document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("speed").addEventListener("input", (e) => {
    speed = parseFloat(e.target.value);
    document.documentElement.style.setProperty("--t", String(1 / speed));
    $("speed-out").textContent = `${speed.toFixed(1)}×`;
  });

  programEl.addEventListener("input", onProgramEdit);
  programEl.addEventListener("scroll", () => {
    mirrorEl.scrollTop = programEl.scrollTop;
    mirrorEl.scrollLeft = programEl.scrollLeft;
  });

  /* ============================================================
     9. ARRANQUE
     ============================================================ */
  const DEFAULT_PROGRAM = [
    "% NEO-BOT · una instrucción Prolog por línea",
    "encender",
    "color(magenta)",
    "saludar",
    "repetir(2, derecha)",
    "bailar",
    "color(lima)",
    "rutina(cuadrado)",
    "girar",
    "apagar",
  ].join("\n");

  async function init() {
    drawStars();
    drawStage();
    buildChips();
    programEl.value = DEFAULT_PROGRAM;
    renderMirror();
    placeRobot(4, 2);
    setColor("cian");
    log("i", "% NEO-BOT · cargando base de conocimiento prolog/robot.pl …");

    const badge = $("badge-engine");
    try {
      const res = await fetch("prolog/robot.pl", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      renderSource(text);
      await Prolog.consult(":- use_module(library(lists)).\n" + text);

      const t = await Prolog.ask("tablero(MX, MY).");
      if (t.answers.length) {
        G.cols = toJS(t.answers[0].sub.lookup("MX")) + 1;
        G.rows = toJS(t.answers[0].sub.lookup("MY")) + 1;
        drawStage();
      }
      await syncFromProlog();
      badge.classList.add("ok");
      $("engine-text").textContent = "Tau Prolog · listo";
      log("i", `% base cargada (${srcLines.length} líneas). Tablero ${G.cols}×${G.rows}.`);
      log("i", "% prueba:  ejecutar(encender, E).   o escribe una consulta abajo.");
      toast("Robot apagado · pulsa ▶ Ejecutar o elige «encender»", "", 0);
      validateProgram();
    } catch (err) {
      badge.classList.add("fail");
      $("engine-text").textContent = "Error al cargar Prolog";
      log("e", `No se pudo cargar prolog/robot.pl (${err.message || err}). Abre la página desde un servidor web.`);
      toast("No se pudo cargar la base de conocimiento", "err", 0);
    }
  }

  init();
})();
