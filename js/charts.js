/* ═══════════════════════════════════════════════════════════
   charts.js — Leichtgewichtige SVG/DOM-Charts im Apple-Look.
   Alle Charts registrieren sich für Resize-/Theme-Re-Render.
   ═══════════════════════════════════════════════════════════ */

const Charts = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a",
                   "#30d158", "#64d2ff", "#ffd60a", "#ff6482", "#ac8e68"];

  const registry = [];   // {el, render}
  let tooltipEl = null;

  /* ── Hilfen ───────────────────────────────────────────── */

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function fmtNum(n) {
    return new Intl.NumberFormat("de-DE").format(Math.round(n));
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Math.max(1, ...arr) sprengt bei sehr großen Arrays den Call-Stack
  function maxOf(arr, pick) {
    let m = 0;
    for (const v of arr) { const x = pick ? pick(v) : v; if (x > m) m = x; }
    return m;
  }

  /* Tooltip */
  function tooltip() {
    if (!tooltipEl) tooltipEl = document.getElementById("tooltip");
    return tooltipEl;
  }
  let tipShownAtY = 0;
  function showTip(html, x, y) {
    const t = tooltip();
    tipShownAtY = window.scrollY;
    t.innerHTML = html;
    t.hidden = false;
    const pad = 12;
    const rect = t.getBoundingClientRect();
    let px = Math.min(Math.max(x, rect.width / 2 + pad), innerWidth - rect.width / 2 - pad);
    let py = y;
    if (y - rect.height - 14 < 0) py = y + rect.height + 26; // unter den Cursor ausweichen
    t.style.left = px + "px";
    t.style.top = py + "px";
  }
  function hideTip() { tooltip().hidden = true; }

  /* Tooltip an ein Element binden — Pointer-Events decken Maus UND Touch ab.
     Auf Touch gibt es kein "leave", daher blendet ein Timer wieder aus. */
  let tipHideTimer = null;
  function bindTip(el, htmlAt, onLeave) {
    const show = (e) => {
      const html = htmlAt(e);
      if (html) showTip(html, e.clientX, e.clientY);
      if (e.pointerType === "touch") {
        clearTimeout(tipHideTimer);
        tipHideTimer = setTimeout(() => { hideTip(); if (onLeave) onLeave(); }, 2500);
      }
    };
    el.setAttribute("data-tip", "");
    el.addEventListener("pointermove", show);
    el.addEventListener("pointerdown", show);
    el.addEventListener("pointerleave", (e) => {
      // Touch feuert pointerleave sofort nach dem Tap — dort räumt der Timer auf
      if (e.pointerType === "touch") return;
      hideTip();
      if (onLeave) onLeave();
    });
  }
  // Beim Scrollen oder Tippen außerhalb eines Charts ausblenden (Touch).
  // Nur bei echter Positionsänderung — manche Browser feuern scroll-Events
  // auch ohne Bewegung (z. B. Mobile-Emulation).
  window.addEventListener("scroll", () => {
    if (Math.abs(window.scrollY - tipShownAtY) > 6) hideTip();
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target instanceof Element) || !e.target.closest("[data-tip]")) hideTip();
  }, true);

  /* Barrierefreiheit: Container beschriften. SVG-only-Charts als Bild,
     Charts mit lesbarem DOM-Text als Gruppe (Text bleibt zugänglich). */
  function applyAria(el, opts, asImage) {
    if (!opts.aria) return;
    el.setAttribute("role", asImage ? "img" : "group");
    el.setAttribute("aria-label", opts.aria);
  }

  /* Registrierung: rendert sofort & bei Resize/Theme-Wechsel neu */
  function register(el, render) {
    registry.push({ el, render });
    render();
  }
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rerenderAll, 220);
  });
  function rerenderAll() {
    for (const r of registry) if (r.el.isConnected) r.render();
  }
  function reset() { registry.length = 0; }

  /* Gemeinsames Chart-Setup */
  function makeSvg(el, height) {
    el.innerHTML = "";
    const width = Math.max(el.clientWidth, 240);
    const svg = svgEl("svg", { class: "chart-svg", width, height, viewBox: `0 0 ${width} ${height}` });
    el.appendChild(svg);
    return { svg, width, height };
  }

  function yGrid(svg, pad, width, height, maxVal, steps = 4) {
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + (height - pad.t - pad.b) * (1 - i / steps);
      svg.appendChild(svgEl("line", { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: "gridline" }));
      const label = svgEl("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end" });
      label.textContent = fmtNum(maxVal * i / steps);
      svg.appendChild(label);
    }
  }

  /* Catmull-Rom → kubische Bezier für weiche Linien */
  function smoothPath(pts) {
    if (pts.length < 2) return "";
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1],
            p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  let gradId = 0;

  /* ═════════ Flächen-/Liniendiagramm (Mehrfach-Serien) ═════════
     opts = { series: [{name, color, values:number[]}], labels: string[],
              height, tipLabel(i) }                                    */
  function area(el, opts) {
    applyAria(el, opts, true);
    register(el, () => {
      const height = opts.height || 260;
      const { svg, width } = makeSvg(el, height);
      const pad = { l: 46, r: 14, t: 14, b: 26 };
      const n = opts.labels.length;
      const maxVal = Math.max(1, maxOf(opts.series, s => maxOf(s.values))) * 1.12;
      const X = i => pad.l + (width - pad.l - pad.r) * (n <= 1 ? 0.5 : i / (n - 1));
      const Y = v => pad.t + (height - pad.t - pad.b) * (1 - v / maxVal);

      yGrid(svg, pad, width, height, maxVal);

      // X-Beschriftung (max. ~6 Labels)
      const step = Math.max(1, Math.ceil(n / 6));
      for (let i = 0; i < n; i += step) {
        const t = svgEl("text", { x: X(i), y: height - 8, "text-anchor": "middle" });
        t.textContent = opts.labels[i];
        svg.appendChild(t);
      }

      for (const s of opts.series) {
        const pts = s.values.map((v, i) => [X(i), Y(v)]);
        const line = smoothPath(pts);

        const gid = "grad" + (++gradId);
        const grad = svgEl("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
        grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": .32 }));
        grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0 }));
        svg.appendChild(grad);

        const fill = svgEl("path", {
          d: `${line} L ${X(n - 1)},${Y(0)} L ${X(0)},${Y(0)} Z`,
          fill: `url(#${gid})`, stroke: "none", opacity: 0,
        });
        svg.appendChild(fill);

        const stroke = svgEl("path", { d: line, fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-linejoin": "round" });
        const len = stroke.getTotalLength ? 2200 : 0;
        stroke.style.strokeDasharray = len;
        stroke.style.strokeDashoffset = len;
        svg.appendChild(stroke);

        requestAnimationFrame(() => {
          stroke.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)";
          fill.style.transition = "opacity 1s ease .5s";
          stroke.style.strokeDashoffset = 0;
          fill.style.opacity = 1;
        });
      }

      // Hover: nächster Datenpunkt
      const hoverLine = svgEl("line", { y1: pad.t, y2: height - pad.b, class: "hover-line" });
      svg.appendChild(hoverLine);
      const dots = opts.series.map(s => {
        const c = svgEl("circle", { r: 4, fill: s.color, stroke: cssVar("--bg"), "stroke-width": 2, opacity: 0 });
        svg.appendChild(c);
        return c;
      });

      bindTip(svg, (e) => {
        const rect = svg.getBoundingClientRect();
        const rel = (e.clientX - rect.left - pad.l) / (width - pad.l - pad.r);
        const i = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
        hoverLine.setAttribute("x1", X(i));
        hoverLine.setAttribute("x2", X(i));
        hoverLine.style.opacity = .5;
        let rows = "";
        opts.series.forEach((s, si) => {
          dots[si].setAttribute("cx", X(i));
          dots[si].setAttribute("cy", Y(s.values[i]));
          dots[si].setAttribute("opacity", 1);
          rows += `<div class="tt-row"><span class="legend-dot" style="background:${s.color}"></span>${s.name}: <b>${fmtNum(s.values[i])}</b></div>`;
        });
        return `<div class="tt-title">${opts.tipLabel ? opts.tipLabel(i) : opts.labels[i]}</div>${rows}`;
      }, () => {
        hoverLine.style.opacity = 0;
        dots.forEach(d => d.setAttribute("opacity", 0));
      });

      if (opts.series.length > 1) {
        const legend = document.createElement("div");
        legend.className = "legend";
        for (const s of opts.series) {
          legend.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.name}</span>`;
        }
        el.appendChild(legend);
      }
    });
  }

  /* ═════════ Balkendiagramm (vertikal) ═════════
     opts = { labels, values, color | colors, height, tipLabel(i) } */
  function bars(el, opts) {
    applyAria(el, opts, true);
    register(el, () => {
      const height = opts.height || 230;
      const { svg, width } = makeSvg(el, height);
      const pad = { l: 46, r: 10, t: 12, b: 26 };
      const n = opts.values.length;
      const maxVal = Math.max(1, maxOf(opts.values)) * 1.12;
      const innerW = width - pad.l - pad.r;
      const bw = Math.min(38, innerW / n * 0.62);
      const X = i => pad.l + innerW * (i + 0.5) / n;
      const Y = v => pad.t + (height - pad.t - pad.b) * (1 - v / maxVal);

      yGrid(svg, pad, width, height, maxVal);

      const labelStep = Math.max(1, Math.ceil(n / 12));
      opts.values.forEach((v, i) => {
        const color = opts.colors ? opts.colors[i % opts.colors.length] : (opts.color || PALETTE[0]);
        const y = Y(v), h = Y(0) - y;
        const r = svgEl("rect", {
          x: X(i) - bw / 2, y: Y(0), width: bw, height: 0,
          rx: Math.min(6, bw / 2), fill: color, opacity: .92,
        });
        svg.appendChild(r);
        requestAnimationFrame(() => {
          r.style.transition = `y 1s cubic-bezier(.16,1,.3,1) ${i * 18}ms, height 1s cubic-bezier(.16,1,.3,1) ${i * 18}ms`;
          r.setAttribute("y", y);
          r.setAttribute("height", Math.max(0, h));
        });

        bindTip(r, () => {
          r.style.opacity = 1;
          return `<div class="tt-title">${opts.tipLabel ? opts.tipLabel(i) : opts.labels[i]}</div><div class="tt-row"><b>${fmtNum(v)}</b>&nbsp;Nachrichten</div>`;
        }, () => { r.style.opacity = .92; });

        if (i % labelStep === 0) {
          const t = svgEl("text", { x: X(i), y: height - 8, "text-anchor": "middle" });
          t.textContent = opts.labels[i];
          svg.appendChild(t);
        }
      });
    });
  }

  /* ═════════ Gestapelte Tages-Balken ═════════
     opts = { labels(dates), seriesLabels, data: [{values:[]}], colors, height } */
  function stackedBars(el, opts) {
    applyAria(el, opts, true);
    register(el, () => {
      const height = opts.height || 250;
      const { svg, width } = makeSvg(el, height);
      const pad = { l: 46, r: 10, t: 12, b: 26 };
      const n = opts.data.length;
      const totals = opts.data.map(d => d.values.reduce((s, v) => s + v, 0));
      const maxVal = Math.max(1, maxOf(totals)) * 1.1;
      const innerW = width - pad.l - pad.r;
      const bw = Math.max(2, innerW / n * 0.7);
      const X = i => pad.l + innerW * (i + 0.5) / n;
      const H = v => (height - pad.t - pad.b) * (v / maxVal);

      yGrid(svg, pad, width, height, maxVal);

      const labelStep = Math.max(1, Math.ceil(n / 6));
      opts.data.forEach((d, i) => {
        let yCursor = height - pad.b;
        d.values.forEach((v, si) => {
          if (!v) return;
          const h = H(v);
          yCursor -= h;
          const r = svgEl("rect", {
            x: X(i) - bw / 2, y: yCursor, width: bw, height: Math.max(0, h - 0.5),
            rx: Math.min(2, bw / 3), fill: opts.colors[si % opts.colors.length], opacity: 0,
          });
          svg.appendChild(r);
          requestAnimationFrame(() => {
            r.style.transition = `opacity .6s ease ${i * 8}ms`;
            r.style.opacity = .92;
          });
        });

        // Hover-Zone pro Tag
        const zone = svgEl("rect", {
          x: X(i) - innerW / n / 2, y: pad.t, width: innerW / n, height: height - pad.t - pad.b,
          fill: "transparent",
        });
        bindTip(zone, () => {
          let rows = "";
          d.values.forEach((v, si) => {
            if (!v) return;
            rows += `<div class="tt-row"><span class="legend-dot" style="background:${opts.colors[si % opts.colors.length]}"></span>${opts.seriesLabels[si]}: <b>${fmtNum(v)}</b></div>`;
          });
          return `<div class="tt-title">${opts.tipLabel ? opts.tipLabel(i) : opts.labels[i]}</div>${rows || "<div class='tt-row'>keine Daten</div>"}`;
        });
        svg.appendChild(zone);

        if (i % labelStep === 0) {
          const t = svgEl("text", { x: X(i), y: height - 8, "text-anchor": "middle" });
          t.textContent = opts.labels[i];
          svg.appendChild(t);
        }
      });

      const legend = document.createElement("div");
      legend.className = "legend";
      opts.seriesLabels.forEach((s, si) => {
        legend.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:${opts.colors[si % opts.colors.length]}"></span>${s}</span>`;
      });
      el.appendChild(legend);
    });
  }

  /* ═════════ Donut ═════════
     opts = { items: [{label, value}], centerLabel, size } */
  function donut(el, opts) {
    applyAria(el, opts, false);
    register(el, () => {
      el.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "donut-wrap";
      el.appendChild(wrap);

      const size = opts.size || 190;
      const stroke = 22;
      const r = (size - stroke) / 2;
      const circ = 2 * Math.PI * r;
      const total = opts.items.reduce((s, i) => s + i.value, 0) || 1;

      const svg = svgEl("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: "chart-svg", style: "flex:none;max-width:" + size + "px" });
      svg.appendChild(svgEl("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none",
        stroke: cssVar("--track") || "rgba(128,128,128,.15)", "stroke-width": stroke,
      }));

      let offset = 0;
      opts.items.forEach((item, idx) => {
        const frac = item.value / total;
        const c = svgEl("circle", {
          cx: size / 2, cy: size / 2, r, fill: "none",
          stroke: PALETTE[idx % PALETTE.length], "stroke-width": stroke,
          "stroke-dasharray": `0 ${circ}`,
          "stroke-linecap": frac > 0.02 ? "round" : "butt",
          transform: `rotate(${offset * 360 - 90} ${size / 2} ${size / 2})`,
        });
        svg.appendChild(c);
        const target = `${Math.max(0, frac * circ - (frac > 0.02 ? 2 : 0))} ${circ}`;
        requestAnimationFrame(() => {
          c.style.transition = `stroke-dasharray 1.2s cubic-bezier(.16,1,.3,1) ${idx * 90}ms`;
          c.setAttribute("stroke-dasharray", target);
        });
        bindTip(c, () =>
          `<div class="tt-title">${item.label}</div><div class="tt-row"><b>${fmtNum(item.value)}</b>&nbsp;(${(frac * 100).toFixed(1)} %)</div>`);
        offset += frac;
      });

      const cv = svgEl("text", { x: size / 2, y: size / 2 - 2, "text-anchor": "middle", class: "donut-center-val" });
      cv.textContent = fmtNum(total);
      const cl = svgEl("text", { x: size / 2, y: size / 2 + 18, "text-anchor": "middle", class: "donut-center-lbl" });
      cl.textContent = opts.centerLabel || "";
      svg.appendChild(cv); svg.appendChild(cl);
      wrap.appendChild(svg);

      const legend = document.createElement("div");
      legend.className = "donut-legend";
      opts.items.forEach((item, idx) => {
        const pct = (item.value / total * 100).toFixed(1);
        const div = document.createElement("div");
        div.className = "legend-item";
        div.innerHTML = `<span class="li-left"><span class="legend-dot" style="background:${PALETTE[idx % PALETTE.length]}"></span>${item.label}</span><span class="li-val">${pct}&thinsp;%</span>`;
        legend.appendChild(div);
      });
      wrap.appendChild(legend);
    });
  }

  /* ═════════ Horizontales Balken-Ranking ═════════
     opts = { items: [{label, value, sub}], color | palette:true, valueFmt } */
  function hbars(el, opts) {
    applyAria(el, opts, false);
    register(el, () => {
      el.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "hbars";
      el.appendChild(wrap);
      const maxVal = Math.max(1, maxOf(opts.items, i => i.value));
      opts.items.forEach((item, idx) => {
        const color = opts.palette ? PALETTE[idx % PALETTE.length] : (opts.color || PALETTE[0]);
        const row = document.createElement("div");
        row.className = "hbar";
        row.innerHTML =
          `<span class="hb-label" title="${item.label}">${item.label}</span>` +
          `<span class="hb-track"><span class="hb-fill" style="background:${color}"></span></span>` +
          `<span class="hb-val">${opts.valueFmt ? opts.valueFmt(item.value) : fmtNum(item.value)}${item.sub ? `<span class="hb-sub">${item.sub}</span>` : ""}</span>`;
        wrap.appendChild(row);
        const fill = row.querySelector(".hb-fill");
        setTimeout(() => { fill.style.width = (item.value / maxVal * 100) + "%"; }, 60 + idx * 55);
      });
    });
  }

  /* ═════════ Heatmap Stunde × Wochentag ═════════
     opts = { heat: number[7][24], rowLabels } */
  function heatmap(el, opts) {
    applyAria(el, opts, true);
    register(el, () => {
      el.innerHTML = "";
      const outer = document.createElement("div");
      outer.className = "heatmap";
      const grid = document.createElement("div");
      grid.className = "heatmap-grid";
      outer.appendChild(grid);
      el.appendChild(outer);

      const maxVal = Math.max(1, maxOf(opts.heat, row => maxOf(row)));
      const base = cssVar("--blue") || "#0a84ff";

      // Kopfzeile (Stunden)
      grid.appendChild(document.createElement("span"));
      for (let h = 0; h < 24; h++) {
        const lbl = document.createElement("span");
        lbl.className = "hm-collabel";
        lbl.textContent = h % 3 === 0 ? h : "";
        grid.appendChild(lbl);
      }

      opts.heat.forEach((row, ri) => {
        const lbl = document.createElement("span");
        lbl.className = "hm-rowlabel";
        lbl.textContent = opts.rowLabels[ri];
        grid.appendChild(lbl);
        row.forEach((v, hi) => {
          const cell = document.createElement("div");
          cell.className = "hm-cell";
          const alpha = v === 0 ? 0 : 0.15 + 0.85 * Math.pow(v / maxVal, 0.6);
          if (v > 0) cell.style.background = `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`;
          cell.style.animationDelay = `${(ri * 24 + hi) * 3}ms`;
          bindTip(cell, () =>
            `<div class="tt-title">${opts.rowLabels[ri]}, ${hi}–${hi + 1} Uhr</div><div class="tt-row"><b>${fmtNum(v)}</b>&nbsp;Nachrichten</div>`);
          grid.appendChild(cell);
        });
      });
    });
  }

  /* ═════════ Kalender (GitHub-Style) ═════════
     opts = { perDay: [{date:"2026-05-21", msgs}], tipLabel(dateKey) } */
  function calendar(el, opts) {
    applyAria(el, opts, true);
    register(el, () => {
      el.innerHTML = "";
      const outer = document.createElement("div");
      outer.className = "calendar";
      el.appendChild(outer);

      const byDate = new Map(opts.perDay.map(d => [d.date, d.msgs]));
      const maxVal = Math.max(1, maxOf(opts.perDay, d => d.msgs));
      const base = cssVar("--green") || "#30d158";

      const first = new Date(opts.perDay[0].date + "T12:00:00");
      const last = new Date(opts.perDay[opts.perDay.length - 1].date + "T12:00:00");
      // Auf Montag der ersten Woche zurückgehen
      const cursor = new Date(first);
      cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

      const grid = document.createElement("div");
      grid.className = "cal-grid";
      const months = document.createElement("div");
      months.className = "cal-months";

      let week = null, lastMonth = -1, weekCount = 0;
      const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
      while (cursor <= last) {
        if ((cursor.getDay() + 6) % 7 === 0) {
          week = document.createElement("div");
          week.className = "cal-week";
          grid.appendChild(week);
          weekCount++;
          const lbl = document.createElement("span");
          if (cursor.getMonth() !== lastMonth) {
            lbl.textContent = MON[cursor.getMonth()];
            lastMonth = cursor.getMonth();
          }
          months.appendChild(lbl);
        }
        const key = cursor.getFullYear() + "-" +
          String(cursor.getMonth() + 1).padStart(2, "0") + "-" +
          String(cursor.getDate()).padStart(2, "0");
        const inRange = cursor >= first && cursor <= last;
        const v = byDate.get(key) || 0;
        const cell = document.createElement("div");
        cell.className = "cal-cell" + (inRange ? "" : " out");
        if (inRange && v > 0) {
          const alpha = 0.18 + 0.82 * Math.pow(v / maxVal, 0.6);
          cell.style.background = `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`;
        }
        if (inRange) {
          const label = new Date(key + "T12:00:00").toLocaleDateString("de-DE",
            { weekday: "short", day: "numeric", month: "long" });
          bindTip(cell, () =>
            `<div class="tt-title">${label}</div><div class="tt-row"><b>${fmtNum(v)}</b>&nbsp;Nachrichten</div>`);
        }
        week.appendChild(cell);
        cursor.setDate(cursor.getDate() + 1);
      }
      outer.appendChild(months);
      outer.appendChild(grid);
    });
  }

  /* ═════════ Wortwolke ═════════
     opts = { words: [{key, value}] } */
  function wordcloud(el, opts) {
    applyAria(el, opts, false);
    register(el, () => {
      el.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "wordcloud";
      el.appendChild(wrap);
      const maxVal = Math.max(1, maxOf(opts.words, w => w.value));
      // Größte Wörter in die Mitte mischen
      const shuffled = [...opts.words].sort((a, b) => (a.key.charCodeAt(0) * 31 + a.value) % 17 - (b.key.charCodeAt(0) * 31 + b.value) % 17);
      shuffled.forEach((w, i) => {
        const span = document.createElement("span");
        const f = w.value / maxVal;
        span.textContent = w.key;
        span.style.fontSize = (13 + Math.pow(f, 0.7) * 34) + "px";
        span.style.color = PALETTE[i % PALETTE.length];
        span.style.opacity = 0.55 + f * 0.45;
        span.title = `${w.key}: ${fmtNum(w.value)}×`;
        if (opts.onClick) {
          span.style.cursor = "pointer";
          span.addEventListener("click", () => opts.onClick(w.key));
        }
        wrap.appendChild(span);
      });
    });
  }

  return { area, bars, stackedBars, donut, hbars, heatmap, calendar, wordcloud, rerenderAll, reset, PALETTE, fmtNum };
})();
