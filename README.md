# Customizable Tab Card (`custom:customizable-tab-card`)

*[Version française](README.fr.md)*

Lovelace card that groups other cards into tabs, with a full visual editor:
add / reorder tabs, pick each tab's cards with the Home Assistant card picker,
tab styles and colors.

The interface is available in English and French (it follows the Home Assistant language).

## Screenshots

![Tab bar](https://raw.githubusercontent.com/Ergorock/customizable-tab-card/main/images/tab-bar.png)

![Tabs wrapping other cards](https://raw.githubusercontent.com/Ergorock/customizable-tab-card/main/images/dashboard.webp)

![Visual editor: tabs](https://raw.githubusercontent.com/Ergorock/customizable-tab-card/main/images/editor-tabs.png)

![Visual editor: appearance](https://raw.githubusercontent.com/Ergorock/customizable-tab-card/main/images/editor-appearance.png)

## Installation

### HACS (custom repository)

1. HACS → ⋮ menu → *Custom repositories* → add `https://github.com/Ergorock/customizable-tab-card`, category **Dashboard**.
2. Install **Customizable Tab Card**, then reload your browser.

### Manual

1. Copy `customizable-tab-card.js` to `config/www/customizable-tab-card.js`.
2. *Settings → Dashboards → ⋮ → Resources*: add `/local/customizable-tab-card.js?v=1.0.0` (type *JavaScript module*).

After an update, force-refresh your browser (Ctrl+Shift+R).

## Usage

In a dashboard: **Add card → Customizable Tab Card**. Everything is set in the visual editor:

- **Tabs**: click a tab to edit it (title, icon, color, card layout),
  move it with the arrows, duplicate or delete it. The selected tab is shown in the preview.
- **Cards in the tab**: “Add a card” opens the Home Assistant card picker; each card is edited
  with its own editor (visual or code), and can be reordered, duplicated or moved to another tab.
- **Appearance**: style, position, colors and behavior of the tab bar.

### General options

| Option | Default | Description |
|---|---|---|
| `tabs` | — | List of tabs (see below) |
| `style` | `underline` | `underline`, `pills`, `segmented` or `boxed` (folder) |
| `position` | `top` | `top`, `bottom`, `left` or `right` |
| `alignment` | `start` | `start`, `center`, `end` or `stretch` (tabs across the full width) |
| `display` | `icon_label` | `icon_label`, `icon_above`, `icon` (icon only) or `label` (text only) |
| `size` | `medium` | `small`, `medium` or `large` |
| `animation` | `fade` | `none`, `fade` or `slide` |
| `accent_color` | primary color | Active tab color |
| `inactive_color` | secondary text | Text color of inactive tabs |
| `bar_background` | — | Tab bar background (background of inactive tabs in `boxed` style) |
| `tint_inactive` | `false` | Also tints inactive tabs with their color |
| `default_tab` | `1` | Tab open on load (starting at 1) |
| `remember_tab` | `false` | Reopens the last viewed tab (stored in the browser) |
| `swipe` | `true` | Changes tab with a horizontal swipe on touch screens |
| `card_background` | `false` | Wraps the bar and the cards in a card |
| `id` | — | Identifier for `remember_tab` when several cards have the same tab titles |

### Tab options

| Option | Default | Description |
|---|---|---|
| `title` | `Tab N` | Tab title |
| `icon` | — | Icon (`mdi:…`) |
| `color` | `accent_color` | Tab color |
| `layout` | `vertical` | `vertical` (stacked), `horizontal` (side by side) or `grid` |
| `columns` | `2` | Number of columns in `grid` layout |
| `cards` | `[]` | Cards shown in the tab |

Colors accept Home Assistant theme colors (`red`, `amber`, `primary`…) or any CSS color
(`"#5291CE"`, `"rgb(0 128 0)"`, `"var(--my-color)"`). The text of filled tabs automatically switches
to light or dark depending on the color.

```yaml
type: custom:customizable-tab-card
style: pills
alignment: stretch
tabs:
  - title: Living room
    icon: mdi:sofa
    color: amber
    cards:
      - type: tile
        entity: light.living_room
  - title: Weather
    icon: mdi:weather-partly-cloudy
    color: "#5291CE"
    layout: grid
    columns: 2
    cards:
      - type: weather-forecast
        entity: weather.home
      - type: sensor
        entity: sensor.outdoor_temperature
```

A tab's cards are only created the first time it is opened.

`test/preview.html` previews the card and the editor outside Home Assistant with mock cards.
