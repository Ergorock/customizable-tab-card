/**
 * Customizable Tab Card
 * Carte Lovelace qui regroupe d'autres cartes dans des onglets,
 * avec un éditeur visuel (onglets, cartes, styles et couleurs).
 */

const CARD_VERSION = "1.0.0";

const DEFAULTS = {
  style: "underline",
  position: "top",
  alignment: "start",
  display: "icon_label",
  size: "medium",
  animation: "fade",
  default_tab: 1,
  tint_inactive: false,
  swipe: true,
  remember_tab: false,
  card_background: false,
};

const COLOR_KEYS = ["accent_color", "inactive_color", "bar_background"];
const TAB_KEYS = ["title", "icon", "color", "layout", "columns"];

// Couleurs du thème Home Assistant (valeurs du sélecteur ui_color)
const THEME_COLORS = new Set([
  "primary", "accent", "disabled", "red", "pink", "purple", "deep-purple", "indigo", "blue",
  "light-blue", "cyan", "teal", "green", "light-green", "lime", "yellow", "amber", "orange",
  "deep-orange", "brown", "light-grey", "grey", "dark-grey", "blue-grey", "black", "white",
]);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const isUnset = (v) => v === undefined || v === null || v === "" || v === "default" || v === "none";

// Convertit une couleur de config (nom du thème, hex, rgb(), [r, g, b]) en valeur CSS
const cssColor = (v) => {
  if (isUnset(v)) return "";
  if (Array.isArray(v)) return `rgb(${v.slice(0, 3).join(",")})`;
  const s = String(v).trim();
  return THEME_COLORS.has(s) ? `var(--${s}-color)` : s;
};

// Couleur de texte lisible sur un fond donné (valeur calculée "rgb(r, g, b)")
const contrastFor = (computed) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(computed || "");
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return "";
  const lum = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#fff";
};

// Normalise la liste des onglets : chaque onglet a une liste "cards"
const normalizeTabs = (tabs) =>
  (Array.isArray(tabs) ? tabs : []).map((t) => {
    const tab = t && typeof t === "object" ? { ...t } : { title: String(t ?? "") };
    if (!Array.isArray(tab.cards)) tab.cards = tab.card ? [tab.card] : [];
    delete tab.card;
    return tab;
  });

let helpersPromise;
const getHelpers = () => (helpersPromise ||= window.loadCardHelpers ? window.loadCardHelpers() : Promise.resolve(null));

// Création d'une carte sans les helpers de Home Assistant (ex. prévisualisation hors HA)
const fallbackCard = (conf) => {
  const type = String(conf?.type || "");
  const tag = type.startsWith("custom:") ? type.slice(7) : `hui-${type}-card`;
  try {
    const el = document.createElement(tag);
    el.setConfig?.(conf);
    return el;
  } catch (e) {
    const el = document.createElement("div");
    el.className = "error";
    el.textContent = `Carte « ${type} » : ${e.message}`;
    return el;
  }
};

// Éléments sur lesquels un balayage ne doit pas changer d'onglet
const NO_SWIPE = "input, textarea, ha-slider, ha-control-slider, ha-control-circular-slider, round-slider, [role=slider], .no-swipe";

class TabCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("customizable-tab-card-editor");
  }

  static getStubConfig() {
    return {
      tabs: [
        { title: "Salon", icon: "mdi:sofa", cards: [{ type: "markdown", content: "Contenu de l'onglet **Salon**" }] },
        { title: "Cuisine", icon: "mdi:silverware-fork-knife", cards: [{ type: "markdown", content: "Contenu de l'onglet **Cuisine**" }] },
      ],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cards = []; // éléments des cartes, par onglet (créés à la première ouverture)
    this._pool = new Map(); // config JSON -> éléments réutilisables après un setConfig
    this._onEditorSelect = (ev) => {
      if (this._inEditor()) this._select(ev.detail.index);
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.tabs)) throw new Error("La carte doit contenir une liste « tabs »");
    this._config = { ...DEFAULTS, ...config, tabs: normalizeTabs(config.tabs) };
    // Garde les cartes déjà créées pour les réutiliser si leur config n'a pas changé
    this._pool = new Map();
    this._cards.flat().forEach((el) => {
      const list = this._pool.get(el._tabCardKey) || [];
      list.push(el);
      this._pool.set(el._tabCardKey, list);
    });
    this._cards = [];
    if (this._index === undefined) this._index = this._initialIndex();
    this._render();
    const ready = (h) => {
      this._helpers = h;
      this._helpersLoaded = true;
      this._ensureTab(this._activeIndex());
    };
    getHelpers().then(ready, () => ready(null));
  }

  set hass(hass) {
    this._hass = hass;
    (this._cards[this._activeIndex()] || []).forEach((el) => (el.hass = hass));
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    window.addEventListener("customizable-tab-card-editor-select", this._onEditorSelect);
    requestAnimationFrame(() => this._applyContrast());
  }

  disconnectedCallback() {
    window.removeEventListener("customizable-tab-card-editor-select", this._onEditorSelect);
  }

  async getCardSize() {
    const cards = this._cards[this._activeIndex()] || [];
    const sizes = await Promise.all(cards.map((c) => (typeof c.getCardSize === "function" ? c.getCardSize() : 1)));
    return 1 + sizes.reduce((a, b) => a + (Number(b) || 1), 0);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 3, rows: "auto" };
  }

  _activeIndex() {
    const n = this._config?.tabs.length || 0;
    return Math.min(Math.max(0, this._index || 0), Math.max(0, n - 1));
  }

  _storageKey() {
    const c = this._config;
    return `customizable-tab-card:${c.id || c.tabs.map((t) => t.title || "").join("|")}`;
  }

  _initialIndex() {
    const c = this._config;
    if (c.remember_tab) {
      try {
        const saved = localStorage.getItem(this._storageKey());
        if (saved !== null && !isNaN(saved)) return Number(saved);
      } catch (e) {
        /* stockage indisponible */
      }
    }
    return (Number(c.default_tab) || 1) - 1;
  }

  // Vrai si la carte est affichée dans la prévisualisation de l'éditeur
  _inEditor() {
    let n = this;
    while (n) {
      if (n.localName === "hui-card-preview" || n.localName === "hui-dialog-edit-card") return true;
      n = n.parentNode || n.host;
    }
    return false;
  }

  _createCard(conf) {
    const key = JSON.stringify(conf);
    const reused = this._pool.get(key)?.pop();
    if (reused) return reused;
    const el = this._helpers ? this._helpers.createCardElement(conf) : fallbackCard(conf);
    el._tabCardKey = key;
    // Une carte encore en chargement demande à être reconstruite une fois définie
    el.addEventListener("ll-rebuild", (ev) => {
      ev.stopPropagation();
      this._pool.delete(key);
      const fresh = this._createCard(conf);
      if (this._hass) fresh.hass = this._hass;
      this._cards = this._cards.map((list) => list?.map((c) => (c === el ? fresh : c)));
      el.replaceWith(fresh);
    }, { once: true });
    return el;
  }

  _ensureTab(i) {
    const tab = this._config?.tabs[i];
    if (!tab || this._cards[i] || !this._helpersLoaded) return;
    this._cards[i] = tab.cards.map((c) => this._createCard(c));
    this._cards[i].forEach((el) => this._hass && (el.hass = this._hass));
    this.shadowRoot.getElementById(`panel-${i}`)?.append(...this._cards[i]);
  }

  _select(i) {
    const c = this._config;
    if (!c?.tabs.length) return;
    const prev = this._activeIndex();
    this._index = i;
    const next = this._activeIndex();
    try {
      if (c.remember_tab) localStorage.setItem(this._storageKey(), String(next));
    } catch (e) {
      /* stockage indisponible */
    }
    this.shadowRoot.querySelectorAll(".tab").forEach((btn, j) => {
      btn.setAttribute("aria-selected", String(j === next));
      btn.tabIndex = j === next ? 0 : -1;
    });
    this.shadowRoot.querySelectorAll(".panel").forEach((p, j) => (p.hidden = j !== next));
    this._updateCurrent();
    this._ensureTab(next);
    (this._cards[next] || []).forEach((el) => this._hass && (el.hass = this._hass));
    const panel = this.shadowRoot.getElementById(`panel-${next}`);
    if (panel && next !== prev && c.animation !== "none") {
      panel.classList.remove("enter", "next", "prev");
      void panel.offsetWidth; // relance l'animation
      panel.classList.add("enter", next > prev ? "next" : "prev");
    }
    this.shadowRoot.querySelector(".tab[aria-selected=true]")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  _updateCurrent() {
    const root = this.shadowRoot.querySelector(".root");
    const tab = this._config.tabs[this._activeIndex()];
    root?.style.setProperty("--tab-current", cssColor(tab?.color) || "var(--tab-accent)");
  }

  // Calcule la couleur du texte des onglets remplis selon la couleur réelle de l'onglet
  _applyContrast() {
    this.shadowRoot.querySelectorAll(".tab").forEach((btn) => {
      const probe = btn.querySelector(".probe");
      const color = probe && contrastFor(getComputedStyle(probe).color);
      if (color) btn.style.setProperty("--tab-on-color", color);
    });
  }

  _render() {
    const c = this._config;
    const active = this._activeIndex();
    const vertical = c.position === "left" || c.position === "right";
    const classes = [
      "root", `pos-${c.position}`, `style-${c.style}`, `align-${c.alignment}`, `display-${c.display}`,
      `size-${c.size}`, `anim-${c.animation}`, vertical ? "vertical" : "horizontal", c.tint_inactive ? "tint" : "",
    ].filter(Boolean).join(" ");
    const vars = [
      c.accent_color && `--tab-accent:${cssColor(c.accent_color)}`,
      c.inactive_color && `--tab-inactive:${cssColor(c.inactive_color)}`,
      c.bar_background && `--tab-bar-bg:${cssColor(c.bar_background)}`,
    ].filter(Boolean).join(";");

    const tabs = c.tabs.map((t, i) => {
      const showIcon = t.icon && c.display !== "label";
      const showLabel = !(c.display === "icon" && t.icon);
      const label = t.title || `Onglet ${i + 1}`;
      return `
        <button class="tab" role="tab" id="tab-${i}" data-index="${i}" aria-controls="panel-${i}"
          aria-selected="${i === active}" tabindex="${i === active ? 0 : -1}" title="${esc(label)}"
          ${t.color ? `style="--tab-color:${esc(cssColor(t.color))}"` : ""}>
          ${showIcon ? `<ha-icon icon="${esc(t.icon)}"></ha-icon>` : ""}
          ${showLabel ? `<span class="label">${esc(label)}</span>` : ""}
          <span class="probe"></span>
        </button>`;
    }).join("");

    const panels = c.tabs.map((t, i) => `
      <div class="panel layout-${esc(t.layout || "vertical")}" role="tabpanel" id="panel-${i}" aria-labelledby="tab-${i}"
        style="--cols:${Math.max(1, Number(t.columns) || 2)}" ${i === active ? "" : "hidden"}>
        ${t.cards.length ? "" : `<div class="empty">Aucune carte dans cet onglet</div>`}
      </div>`).join("");

    const inner = c.tabs.length
      ? `<div class="bar" role="tablist" aria-orientation="${vertical ? "vertical" : "horizontal"}">${tabs}</div>
         <div class="panels">${panels}</div>`
      : `<div class="empty">Ajoutez un onglet dans l'éditeur de la carte.</div>`;

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      ${c.card_background
        ? `<ha-card class="${classes} framed" style="${vars}">${inner}</ha-card>`
        : `<div class="${classes}" style="${vars}">${inner}</div>`}`;

    const bar = this.shadowRoot.querySelector(".bar");
    if (!bar) return;
    bar.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".tab");
      if (btn) this._select(Number(btn.dataset.index));
    });
    bar.addEventListener("keydown", (ev) => {
      const n = c.tabs.length;
      const step = (vertical ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 })[ev.key];
      let i = this._activeIndex();
      if (step) i = (i + step + n) % n;
      else if (ev.key === "Home") i = 0;
      else if (ev.key === "End") i = n - 1;
      else return;
      ev.preventDefault();
      this._select(i);
      this.shadowRoot.getElementById(`tab-${i}`)?.focus();
    });

    const panelsEl = this.shadowRoot.querySelector(".panels");
    panelsEl.addEventListener("animationend", (ev) => {
      if (ev.target.classList?.contains("panel")) ev.target.classList.remove("enter", "next", "prev");
    });
    if (c.swipe) {
      panelsEl.addEventListener("touchstart", (ev) => {
        const blocked = ev.composedPath().some((n) => n instanceof Element && n.matches(NO_SWIPE));
        const t = ev.touches[0];
        this._touch = blocked || ev.touches.length > 1 ? null : { x: t.clientX, y: t.clientY, time: Date.now() };
      }, { passive: true });
      panelsEl.addEventListener("touchend", (ev) => {
        const start = this._touch;
        this._touch = null;
        if (!start) return;
        const t = ev.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy) || Date.now() - start.time > 700) return;
        const i = this._activeIndex() + (dx < 0 ? 1 : -1);
        if (i >= 0 && i < c.tabs.length) this._select(i);
      }, { passive: true });
    }

    this._updateCurrent();
    requestAnimationFrame(() => this._applyContrast());
  }
}

const STYLES = `
  :host { display: block; }
  .root {
    display: flex; flex-direction: column; gap: 8px; min-width: 0;
    --tab-accent: var(--primary-color);
    --tab-inactive: var(--secondary-text-color);
    --tab-gap: var(--vertical-stack-card-gap, var(--stack-card-gap, 8px));
  }
  .root.framed { padding: 12px; box-sizing: border-box; }
  .root.pos-bottom { flex-direction: column-reverse; }
  .root.pos-left { flex-direction: row; }
  .root.pos-right { flex-direction: row-reverse; }
  .root.size-small { --tab-font: 0.85rem; --tab-pad: 6px 10px; --tab-icon: 18px; }
  .root.size-medium { --tab-font: 0.95rem; --tab-pad: 10px 14px; --tab-icon: 20px; }
  .root.size-large { --tab-font: 1.1rem; --tab-pad: 14px 20px; --tab-icon: 24px; }

  .bar { display: flex; gap: 4px; background: var(--tab-bar-bg, transparent); overflow-x: auto; scrollbar-width: none; flex: none; }
  .bar::-webkit-scrollbar { display: none; }
  .vertical .bar { flex-direction: column; overflow: visible auto; max-width: 40%; }
  .align-center .bar { justify-content: center; }
  .align-end .bar { justify-content: flex-end; }
  .horizontal.align-stretch .tab { flex: 1 1 0; }
  .vertical.align-center .bar { justify-content: center; }
  .vertical.align-end .bar { justify-content: flex-end; }

  .tab {
    --tab-color: var(--tab-accent);
    appearance: none; border: none; background: none; margin: 0; font: inherit; font-size: var(--tab-font); font-weight: 500;
    color: var(--tab-inactive); cursor: pointer; position: relative; flex: none;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: var(--tab-pad); white-space: nowrap; border-radius: 8px;
    transition: color .2s, background-color .2s, box-shadow .2s;
    -webkit-tap-highlight-color: transparent;
  }
  .vertical .tab { justify-content: flex-start; }
  .tab:hover { background-color: color-mix(in srgb, var(--tab-color) 10%, transparent); }
  .tab:focus-visible { outline: 2px solid var(--tab-color); outline-offset: -2px; }
  .tab ha-icon { --mdc-icon-size: var(--tab-icon); flex: none; }
  .display-icon_above .tab { flex-direction: column; gap: 2px; }
  .display-icon_above .label { font-size: 0.85em; }
  .probe { position: absolute; width: 0; height: 0; overflow: hidden; color: var(--tab-color); pointer-events: none; }
  .tint .tab[aria-selected=false] { color: var(--tab-color); }

  /* Soulignés */
  .style-underline .bar { border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
  .style-underline.pos-bottom .bar { border-bottom: none; border-top: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
  .style-underline.pos-left .bar { border-bottom: none; border-right: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
  .style-underline.pos-right .bar { border-bottom: none; border-left: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
  .style-underline .tab { border-radius: 8px 8px 0 0; }
  .style-underline .tab::after {
    content: ""; position: absolute; left: 10px; right: 10px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0;
    background: var(--tab-color); transform: scaleX(0); transition: transform .25s ease;
  }
  .style-underline.pos-bottom .tab { border-radius: 0 0 8px 8px; }
  .style-underline.pos-bottom .tab::after { bottom: auto; top: 0; border-radius: 0 0 3px 3px; }
  .style-underline.vertical .tab { border-radius: 8px 0 0 8px; }
  .style-underline.vertical .tab::after { left: auto; right: 0; top: 8px; bottom: 8px; width: 3px; height: auto; border-radius: 3px 0 0 3px; transform: scaleY(0); }
  .style-underline.pos-right .tab { border-radius: 0 8px 8px 0; }
  .style-underline.pos-right .tab::after { right: auto; left: 0; border-radius: 0 3px 3px 0; }
  .style-underline .tab[aria-selected=true] { color: var(--tab-color); }
  .style-underline .tab[aria-selected=true]::after { transform: none; }

  /* Pastilles */
  .style-pills .bar { gap: 6px; padding: 2px; }
  .style-pills .tab { border-radius: 999px; }
  .style-pills.tint .tab[aria-selected=false] { background-color: color-mix(in srgb, var(--tab-color) 14%, transparent); }

  /* Segmentés */
  .style-segmented .bar { background: var(--tab-bar-bg, var(--secondary-background-color, rgba(127,127,127,.12))); padding: 4px; gap: 2px; border-radius: 12px; }
  .style-segmented .tab { border-radius: 9px; }

  /* Classeur */
  .root.style-boxed { gap: 0; }
  .style-boxed .bar { gap: 4px; background: transparent; border-bottom: 3px solid var(--tab-current); }
  .style-boxed .tab { border-radius: 10px 10px 0 0; background-color: var(--tab-bar-bg, var(--secondary-background-color, rgba(127,127,127,.12))); }
  .style-boxed.tint .tab[aria-selected=false] { background-color: color-mix(in srgb, var(--tab-color) 18%, transparent); }
  .style-boxed.pos-bottom .bar { border-bottom: none; border-top: 3px solid var(--tab-current); }
  .style-boxed.pos-bottom .tab { border-radius: 0 0 10px 10px; }
  .style-boxed.pos-left .bar { border-bottom: none; border-right: 3px solid var(--tab-current); }
  .style-boxed.pos-left .tab { border-radius: 10px 0 0 10px; }
  .style-boxed.pos-right .bar { border-bottom: none; border-left: 3px solid var(--tab-current); }
  .style-boxed.pos-right .tab { border-radius: 0 10px 10px 0; }
  .style-boxed .panels { padding-top: var(--tab-gap); }
  .style-boxed.pos-bottom .panels { padding: 0 0 var(--tab-gap); }
  .style-boxed.pos-left .panels { padding: 0 0 0 var(--tab-gap); }
  .style-boxed.pos-right .panels { padding: 0 var(--tab-gap) 0 0; }

  /* Onglet actif rempli */
  :is(.style-pills, .style-segmented, .style-boxed) .tab[aria-selected=true] {
    background-color: var(--tab-color); color: var(--tab-on-color, var(--text-primary-color, #fff));
  }
  .style-segmented .tab[aria-selected=true] { box-shadow: 0 1px 3px rgba(0,0,0,.25); }

  .panels { min-width: 0; flex: 1; }
  .panel { display: flex; flex-direction: column; gap: var(--tab-gap); min-width: 0; }
  .panel[hidden] { display: none; }
  .panel.layout-horizontal { flex-direction: row; align-items: flex-start; }
  .panel.layout-horizontal > * { flex: 1 1 0; min-width: 0; }
  .panel.layout-grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
  .panel.layout-grid[hidden] { display: none; }
  .empty { padding: 16px; text-align: center; color: var(--secondary-text-color); font-style: italic; }
  .error { padding: 12px; color: var(--error-color, #db4437); }

  .anim-fade .panel.enter { animation: tab-fade .25s ease; }
  .anim-slide .panel.enter.next { animation: tab-slide-next .3s ease; }
  .anim-slide .panel.enter.prev { animation: tab-slide-prev .3s ease; }
  @keyframes tab-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes tab-slide-next { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: none; } }
  @keyframes tab-slide-prev { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .panel.enter { animation: none !important; }
    .tab, .tab::after { transition: none !important; }
  }
`;

/* ---------------------------- Éditeur visuel ---------------------------- */

const LABELS = {
  title: "Titre de l'onglet",
  icon: "Icône",
  color: "Couleur de l'onglet",
  layout: "Disposition des cartes",
  columns: "Nombre de colonnes",
  style: "Style des onglets",
  position: "Position de la barre",
  alignment: "Alignement",
  display: "Contenu des onglets",
  size: "Taille",
  animation: "Animation",
  accent_color: "Couleur de l'onglet actif",
  inactive_color: "Couleur des onglets inactifs",
  bar_background: "Fond de la barre",
  default_tab: "Onglet ouvert par défaut",
  tint_inactive: "Colorer les onglets inactifs",
  swipe: "Changer d'onglet par balayage",
  remember_tab: "Mémoriser le dernier onglet",
  card_background: "Encadrer dans une carte",
};

const options = (o) => Object.entries(o).map(([value, label]) => ({ value, label }));
const select = (o) => ({ select: { mode: "dropdown", options: options(o) } });

const tabSchema = (tab) => [
  {
    type: "grid", name: "", schema: [
      { name: "title", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "color", selector: { ui_color: {} } },
      { name: "layout", selector: select({ vertical: "Empilées", horizontal: "Côte à côte", grid: "Grille" }) },
    ],
  },
  ...(tab.layout === "grid" ? [{ name: "columns", selector: { number: { min: 1, max: 6, mode: "slider" } } }] : []),
];

const styleSchema = (count) => [
  {
    type: "grid", name: "", schema: [
      { name: "style", selector: select({ underline: "Soulignés", pills: "Pastilles", segmented: "Segmentés", boxed: "Classeur" }) },
      { name: "position", selector: select({ top: "En haut", bottom: "En bas", left: "À gauche", right: "À droite" }) },
      { name: "alignment", selector: select({ start: "Début", center: "Centré", end: "Fin", stretch: "Pleine largeur" }) },
      { name: "display", selector: select({ icon_label: "Icône + texte", icon_above: "Icône au-dessus du texte", icon: "Icône seule", label: "Texte seul" }) },
      { name: "size", selector: select({ small: "Petite", medium: "Moyenne", large: "Grande" }) },
      { name: "animation", selector: select({ none: "Aucune", fade: "Fondu", slide: "Glissement" }) },
    ],
  },
  {
    type: "grid", name: "", schema: [
      { name: "accent_color", selector: { ui_color: { default_color: "primary" } } },
      { name: "inactive_color", selector: { ui_color: {} } },
      { name: "bar_background", selector: { ui_color: {} } },
      { name: "default_tab", selector: { number: { min: 1, max: Math.max(1, count), mode: "box" } } },
    ],
  },
  {
    type: "grid", name: "", schema: [
      { name: "tint_inactive", selector: { boolean: {} } },
      { name: "swipe", selector: { boolean: {} } },
      { name: "remember_tab", selector: { boolean: {} } },
      { name: "card_background", selector: { boolean: {} } },
    ],
  },
];

const STYLE_KEYS = [...Object.keys(DEFAULTS), ...COLOR_KEYS];

const cardLabel = (c) =>
  String(c?.type || "?").replace(/^custom:/, "").replace(/-card$/, "").replace(/[-_]/g, " ");

const clone = (o) => JSON.parse(JSON.stringify(o));
const move = (list, from, to) => {
  const out = [...list];
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
};

// Rend la config d'un onglet lisible : clés dans l'ordre, valeurs par défaut retirées
const cleanTab = (t) => {
  const out = {};
  TAB_KEYS.forEach((k) => !isUnset(t[k]) && (out[k] = t[k]));
  if (out.layout === "vertical") delete out.layout;
  if (out.layout !== "grid") delete out.columns;
  Object.keys(t).forEach((k) => !TAB_KEYS.includes(k) && k !== "cards" && (out[k] = t[k]));
  out.cards = t.cards || [];
  return out;
};

// Charge les éditeurs de cartes de Home Assistant (sélecteur de carte et éditeur de carte)
let editorComponents;
const loadEditorComponents = () => (editorComponents ||= (async () => {
  if (customElements.get("hui-card-element-editor") && customElements.get("hui-card-picker")) return;
  const helpers = await getHelpers();
  if (!helpers) throw new Error("helpers indisponibles");
  helpers.createCardElement({ type: "vertical-stack", cards: [] });
  await customElements.whenDefined("hui-vertical-stack-card");
  await customElements.get("hui-vertical-stack-card").getConfigElement();
  await Promise.race([
    Promise.all([customElements.whenDefined("hui-card-element-editor"), customElements.whenDefined("hui-card-picker")]),
    new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 10000)),
  ]);
})());

const btn = (act, icon, title, cls = "") =>
  `<button class="icon-btn ${cls}" data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}"><ha-icon icon="${icon}"></ha-icon></button>`;

class TabCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = 0;
    this._card = 0;
    this._picking = false;
    this._guiMode = true;
  }

  set hass(hass) {
    this._hass = hass;
    [this._tabForm, this._styleForm, this._cardEditor, this._picker].forEach((el) => el && (el.hass = hass));
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    [this._cardEditor, this._picker].forEach((el) => el && (el.lovelace = lovelace));
  }

  get lovelace() {
    return this._lovelace;
  }

  setConfig(config) {
    this._config = { ...config, tabs: normalizeTabs(config.tabs) };
    this._build();
    this._update();
  }

  _build() {
    if (this._built) return;
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="section">
        <div class="head"><ha-icon icon="mdi:tab"></ha-icon>Onglets</div>
        <div class="chips" id="tabChips"></div>
        <div class="box" id="tabBox">
          <div class="toolbar">
            ${btn("tab-left", "mdi:arrow-left", "Déplacer l'onglet à gauche")}
            ${btn("tab-right", "mdi:arrow-right", "Déplacer l'onglet à droite")}
            <span class="spacer"></span>
            ${btn("tab-copy", "mdi:content-copy", "Dupliquer l'onglet")}
            ${btn("tab-delete", "mdi:delete", "Supprimer l'onglet", "danger")}
          </div>
          <div id="tabFormHost"></div>
          <div class="subhead"><ha-icon icon="mdi:cards-outline"></ha-icon>Cartes de l'onglet</div>
          <div class="chips small" id="cardChips"></div>
          <div class="toolbar" id="cardToolbar">
            ${btn("card-left", "mdi:arrow-left", "Déplacer la carte avant")}
            ${btn("card-right", "mdi:arrow-right", "Déplacer la carte après")}
            <select id="moveTo" title="Déplacer la carte vers un autre onglet"></select>
            <span class="spacer"></span>
            ${btn("card-mode", "mdi:code-braces", "Afficher l'éditeur de code")}
            ${btn("card-copy", "mdi:content-copy", "Dupliquer la carte")}
            ${btn("card-delete", "mdi:delete", "Supprimer la carte", "danger")}
          </div>
          <div id="cardHost"></div>
        </div>
      </div>
      <div class="section">
        <div class="head"><ha-icon icon="mdi:palette"></ha-icon>Apparence</div>
        <div id="styleFormHost"></div>
      </div>`;

    const $ = (id) => this.shadowRoot.getElementById(id);
    this._tabForm = this._form((v) => this._tabFormChanged(v));
    this._styleForm = this._form((v) => this._styleFormChanged(v));
    $("tabFormHost").appendChild(this._tabForm);
    $("styleFormHost").appendChild(this._styleForm);

    this.shadowRoot.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-act], [data-tab], [data-card]");
      if (!el || el.disabled) return;
      if (el.dataset.tab !== undefined) this._selectTab(Number(el.dataset.tab));
      else if (el.dataset.card !== undefined) this._selectCard(Number(el.dataset.card));
      else this._action(el.dataset.act);
    });
    $("moveTo").addEventListener("change", (ev) => {
      const to = Number(ev.target.value);
      ev.target.value = "";
      if (!isNaN(to)) this._moveCardToTab(to);
    });

    loadEditorComponents().then(
      () => (this._components = "ready"),
      () => (this._components = "error"),
    ).then(() => this._update());
  }

  _form(onChange) {
    const form = document.createElement("ha-form");
    form.computeLabel = (s) => LABELS[s.name] || s.name;
    form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      onChange(ev.detail.value);
    });
    if (this._hass) form.hass = this._hass;
    return form;
  }

  get _tabs() {
    return this._config.tabs;
  }

  _update() {
    if (!this._config) return;
    const $ = (id) => this.shadowRoot.getElementById(id);
    const tabs = this._tabs;
    this._tab = Math.min(Math.max(0, this._tab), Math.max(0, tabs.length - 1));
    const tab = tabs[this._tab];

    $("tabChips").innerHTML = tabs.map((t, i) => `
      <button class="chip ${i === this._tab ? "selected" : ""}" data-tab="${i}">
        ${t.color ? `<span class="dot" style="background:${esc(cssColor(t.color))}"></span>` : ""}
        ${t.icon ? `<ha-icon icon="${esc(t.icon)}"></ha-icon>` : ""}
        <span>${esc(t.title || `Onglet ${i + 1}`)}</span>
      </button>`).join("") +
      `<button class="chip add" data-act="tab-add"><ha-icon icon="mdi:plus"></ha-icon><span>Ajouter un onglet</span></button>`;

    $("tabBox").hidden = !tab;
    if (tab) {
      this._card = Math.min(Math.max(0, this._card), Math.max(0, tab.cards.length - 1));
      const picking = this._picking || !tab.cards.length;
      const set = (act, disabled) => (this.shadowRoot.querySelector(`[data-act="${act}"]`).disabled = disabled);
      set("tab-left", this._tab === 0);
      set("tab-right", this._tab === tabs.length - 1);
      set("card-left", this._card === 0);
      set("card-right", this._card === tab.cards.length - 1);

      this._tabForm.data = { layout: "vertical", columns: 2, ...tab };
      this._tabForm.schema = tabSchema(tab);

      $("cardChips").innerHTML = tab.cards.map((c, i) => `
        <button class="chip ${!picking && i === this._card ? "selected" : ""}" data-card="${i}">${i + 1}. ${esc(cardLabel(c))}</button>`).join("") +
        `<button class="chip add ${picking ? "selected" : ""}" data-act="card-add"><ha-icon icon="mdi:plus"></ha-icon><span>Ajouter une carte</span></button>`;

      $("cardToolbar").hidden = picking;
      $("moveTo").hidden = tabs.length < 2;
      $("moveTo").innerHTML = `<option value="">Déplacer vers…</option>` +
        tabs.map((t, i) => (i === this._tab ? "" : `<option value="${i}">${esc(t.title || `Onglet ${i + 1}`)}</option>`)).join("");
      const mode = this.shadowRoot.querySelector('[data-act="card-mode"]');
      const modeTitle = this._guiMode ? "Afficher l'éditeur de code" : "Afficher l'éditeur visuel";
      mode.title = modeTitle;
      mode.setAttribute("aria-label", modeTitle);
      mode.querySelector("ha-icon").setAttribute("icon", this._guiMode ? "mdi:code-braces" : "mdi:list-box-outline");
      this._updateCardHost(tab, picking);
    }

    this._styleForm.data = { ...DEFAULTS, ...this._config };
    this._styleForm.schema = styleSchema(tabs.length);
  }

  _updateCardHost(tab, picking) {
    const host = this.shadowRoot.getElementById("cardHost");
    if (this._components !== "ready") {
      host.innerHTML = `<div class="msg">${this._components === "error"
        ? "L'éditeur de cartes de Home Assistant n'a pas pu être chargé. Utilisez l'éditeur de code."
        : "Chargement de l'éditeur de cartes…"}</div>`;
      return;
    }
    if (picking) {
      if (!this._picker) {
        this._picker = document.createElement("hui-card-picker");
        this._picker.addEventListener("config-changed", (ev) => {
          ev.stopPropagation();
          if (ev.detail?.config) this._addCard(ev.detail.config);
        });
      }
      this._picker.hass = this._hass;
      this._picker.lovelace = this._lovelace;
      if (host.firstChild !== this._picker) host.replaceChildren(this._picker);
      this._editorKey = undefined;
      return;
    }
    if (!this._cardEditor) {
      this._cardEditor = document.createElement("hui-card-element-editor");
      this._cardEditor.addEventListener("config-changed", (ev) => {
        ev.stopPropagation();
        if (!ev.detail?.config) return;
        this._editorJSON = JSON.stringify(ev.detail.config);
        this._setCard(this._tab, this._card, ev.detail.config);
      });
      this._cardEditor.addEventListener("GUImode-changed", (ev) => {
        ev.stopPropagation();
        this._guiMode = ev.detail.guiMode;
        this._update();
      });
    }
    this._cardEditor.hass = this._hass;
    this._cardEditor.lovelace = this._lovelace;
    // Ne recharge l'éditeur que si la carte sélectionnée ou sa config a changé
    const key = `${this._tab}:${this._card}`;
    const json = JSON.stringify(tab.cards[this._card]);
    if (key !== this._editorKey || json !== this._editorJSON) {
      this._editorKey = key;
      this._editorJSON = json;
      this._cardEditor.value = tab.cards[this._card];
    }
    if (host.firstChild !== this._cardEditor) host.replaceChildren(this._cardEditor);
  }

  _selectTab(i) {
    this._tab = i;
    this._card = 0;
    this._picking = false;
    this._update();
    // Affiche aussi cet onglet dans la prévisualisation
    window.dispatchEvent(new CustomEvent("customizable-tab-card-editor-select", { detail: { index: i } }));
  }

  _selectCard(i) {
    this._card = i;
    this._picking = false;
    this._update();
  }

  _action(act) {
    const tabs = this._tabs;
    const tab = tabs[this._tab];
    switch (act) {
      case "tab-add":
        this._commit({ tabs: [...tabs, { title: `Onglet ${tabs.length + 1}`, icon: "mdi:tab", cards: [] }] });
        return this._selectTab(tabs.length);
      case "tab-left":
      case "tab-right": {
        const to = this._tab + (act === "tab-left" ? -1 : 1);
        this._commit({ tabs: move(tabs, this._tab, to) });
        return this._selectTab(to);
      }
      case "tab-copy": {
        const copy = { ...clone(tab), title: `${tab.title || `Onglet ${this._tab + 1}`} (copie)` };
        this._commit({ tabs: [...tabs.slice(0, this._tab + 1), copy, ...tabs.slice(this._tab + 1)] });
        return this._selectTab(this._tab + 1);
      }
      case "tab-delete": {
        const name = tab.title || `Onglet ${this._tab + 1}`;
        if (tab.cards.length && !window.confirm(`Supprimer l'onglet « ${name} » et ses ${tab.cards.length} carte(s) ?`)) return;
        this._commit({ tabs: tabs.filter((_, i) => i !== this._tab) });
        return this._selectTab(Math.max(0, this._tab - 1));
      }
      case "card-add":
        this._picking = true;
        return this._update();
      case "card-left":
      case "card-right": {
        const to = this._card + (act === "card-left" ? -1 : 1);
        this._setTab(this._tab, { ...tab, cards: move(tab.cards, this._card, to) });
        return this._selectCard(to);
      }
      case "card-copy": {
        const cards = [...tab.cards];
        cards.splice(this._card + 1, 0, clone(cards[this._card]));
        this._setTab(this._tab, { ...tab, cards });
        return this._selectCard(this._card + 1);
      }
      case "card-delete":
        this._setTab(this._tab, { ...tab, cards: tab.cards.filter((_, i) => i !== this._card) });
        return this._selectCard(Math.max(0, this._card - 1));
      case "card-mode":
        return this._cardEditor?.toggleMode?.();
    }
  }

  _addCard(conf) {
    const tab = this._tabs[this._tab];
    this._picking = false;
    this._card = tab.cards.length;
    this._setTab(this._tab, { ...tab, cards: [...tab.cards, conf] });
  }

  _setCard(t, c, conf) {
    const tab = this._tabs[t];
    const cards = [...tab.cards];
    cards[c] = conf;
    this._setTab(t, { ...tab, cards });
  }

  _moveCardToTab(to) {
    const tabs = [...this._tabs];
    const from = tabs[this._tab];
    const card = from.cards[this._card];
    tabs[this._tab] = { ...from, cards: from.cards.filter((_, i) => i !== this._card) };
    tabs[to] = { ...tabs[to], cards: [...tabs[to].cards, card] };
    this._commit({ tabs });
    this._selectTab(to);
    this._selectCard(tabs[to].cards.length - 1);
  }

  _setTab(i, tab) {
    const tabs = [...this._tabs];
    tabs[i] = tab;
    this._commit({ tabs });
  }

  _tabFormChanged(value) {
    const tab = { ...this._tabs[this._tab] };
    TAB_KEYS.forEach((k) => (isUnset(value[k]) ? delete tab[k] : (tab[k] = value[k])));
    this._setTab(this._tab, tab);
  }

  _styleFormChanged(value) {
    const next = { ...this._config };
    STYLE_KEYS.forEach((k) => (isUnset(value[k]) ? delete next[k] : (next[k] = value[k])));
    this._config = next;
    this._fire();
    this._update();
  }

  _commit(patch) {
    this._config = { ...this._config, ...patch };
    this._fire();
    this._update();
  }

  _fire() {
    const c = this._config;
    // N'enregistre pas les valeurs par défaut pour garder un YAML lisible
    const config = { type: c.type || "custom:customizable-tab-card" };
    Object.keys(c).forEach((k) => {
      if (k === "type" || k === "tabs" || isUnset(c[k])) return;
      if (k in DEFAULTS && JSON.stringify(c[k]) === JSON.stringify(DEFAULTS[k])) return;
      config[k] = c[k];
    });
    config.tabs = c.tabs.map(cleanTab);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

const EDITOR_STYLES = `
  :host { display: block; }
  [hidden] { display: none !important; }
  .section + .section { margin-top: 24px; }
  .head, .subhead { display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .head { font-size: 1.1rem; margin-bottom: 10px; }
  .subhead { margin: 18px 0 8px; }
  .head ha-icon, .subhead ha-icon { color: var(--primary-color); --mdc-icon-size: 20px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; min-height: 34px; box-sizing: border-box;
    border-radius: 17px; border: 1px solid var(--divider-color, rgba(127,127,127,.3));
    background: var(--card-background-color, transparent); color: var(--primary-text-color);
    font: inherit; font-size: 0.9rem; cursor: pointer;
  }
  .chip:hover { border-color: var(--primary-color); }
  .chip.selected { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .chips.small .chip:not(.add) { text-transform: capitalize; }
  .chip.add { border-style: dashed; color: var(--primary-color); }
  .chip.add.selected { color: var(--text-primary-color, #fff); border-style: solid; }
  .chip ha-icon { --mdc-icon-size: 18px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1px rgba(127,127,127,.4); }
  .box { margin-top: 12px; padding: 4px 12px 12px; border: 1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius: 12px; }
  .toolbar { display: flex; align-items: center; gap: 2px; margin: 4px 0 8px; }
  .spacer { flex: 1; }
  .icon-btn {
    width: 40px; height: 40px; border-radius: 50%; border: none; background: none; padding: 0;
    color: var(--secondary-text-color); cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover:not(:disabled) { background: rgba(127,127,127,.15); color: var(--primary-text-color); }
  .icon-btn.danger:hover:not(:disabled) { color: var(--error-color, #db4437); }
  .icon-btn:disabled { opacity: .35; cursor: default; }
  .icon-btn:focus-visible, .chip:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  select {
    margin-left: 6px; height: 34px; padding: 0 8px; border-radius: 8px; font: inherit; font-size: 0.9rem;
    border: 1px solid var(--divider-color, rgba(127,127,127,.3)); background: var(--card-background-color, transparent); color: var(--primary-text-color);
  }
  .msg { padding: 12px; color: var(--secondary-text-color); font-style: italic; }
`;

if (!customElements.get("customizable-tab-card")) customElements.define("customizable-tab-card", TabCard);
if (!customElements.get("customizable-tab-card-editor")) customElements.define("customizable-tab-card-editor", TabCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "customizable-tab-card")) {
  window.customCards.push({
    type: "customizable-tab-card",
    name: "Customizable Tab Card",
    description: "Regroupe des cartes dans des onglets personnalisables (style, couleurs, icônes).",
    preview: true,
  });
}

console.info(`%c CUSTOMIZABLE-TAB-CARD %c v${CARD_VERSION} `, "background:#03a9f4;color:#fff;font-weight:700", "");
