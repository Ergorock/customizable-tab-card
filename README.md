# Customizable Tab Card (`custom:customizable-tab-card`)

Carte Lovelace qui regroupe d'autres cartes dans des onglets, avec un éditeur visuel complet :
ajout / réorganisation des onglets, choix des cartes de chaque onglet avec le sélecteur de cartes de Home Assistant,
styles et couleurs des onglets.

## Installation

Ajoutez `customizable-tab-card.js` comme ressource de tableau de bord (type **module JavaScript**).
Après une mise à jour du code, remplacez la ressource puis faites un rafraîchissement forcé du navigateur (Ctrl+Maj+R).

## Utilisation

Dans un tableau de bord : **Ajouter une carte → Customizable Tab Card**. Tout se règle dans l'éditeur visuel :

- **Onglets** : cliquez sur un onglet pour le modifier (titre, icône, couleur, disposition des cartes),
  déplacez-le avec les flèches, dupliquez-le ou supprimez-le. L'onglet sélectionné s'affiche dans la prévisualisation.
- **Cartes de l'onglet** : « Ajouter une carte » ouvre le sélecteur de cartes de Home Assistant ; chaque carte se modifie
  avec son propre éditeur (visuel ou code), peut être réordonnée, dupliquée ou déplacée vers un autre onglet.
- **Apparence** : style, position, couleurs et comportement de la barre d'onglets.

### Options générales

| Option | Défaut | Description |
|---|---|---|
| `tabs` | — | Liste des onglets (voir ci-dessous) |
| `style` | `underline` | `underline` (soulignés), `pills` (pastilles), `segmented` (segmentés) ou `boxed` (classeur) |
| `position` | `top` | `top`, `bottom`, `left` ou `right` |
| `alignment` | `start` | `start`, `center`, `end` ou `stretch` (onglets sur toute la largeur) |
| `display` | `icon_label` | `icon_label`, `icon_above`, `icon` (icône seule) ou `label` (texte seul) |
| `size` | `medium` | `small`, `medium` ou `large` |
| `animation` | `fade` | `none`, `fade` ou `slide` |
| `accent_color` | couleur principale | Couleur de l'onglet actif |
| `inactive_color` | texte secondaire | Couleur du texte des onglets inactifs |
| `bar_background` | — | Fond de la barre d'onglets (fond des onglets inactifs en style `boxed`) |
| `tint_inactive` | `false` | Colore aussi les onglets inactifs avec leur couleur |
| `default_tab` | `1` | Onglet ouvert au chargement (à partir de 1) |
| `remember_tab` | `false` | Rouvre le dernier onglet consulté (mémorisé dans le navigateur) |
| `swipe` | `true` | Change d'onglet par balayage horizontal sur écran tactile |
| `card_background` | `false` | Encadre la barre et les cartes dans une carte |
| `id` | — | Identifiant pour `remember_tab` si plusieurs cartes ont les mêmes titres d'onglets |

### Options d'un onglet

| Option | Défaut | Description |
|---|---|---|
| `title` | `Onglet N` | Titre de l'onglet |
| `icon` | — | Icône (`mdi:…`) |
| `color` | `accent_color` | Couleur de l'onglet |
| `layout` | `vertical` | `vertical` (empilées), `horizontal` (côte à côte) ou `grid` |
| `columns` | `2` | Nombre de colonnes en disposition `grid` |
| `cards` | `[]` | Cartes affichées dans l'onglet |

Les couleurs acceptent les couleurs du thème Home Assistant (`red`, `amber`, `primary`…) ou toute couleur CSS
(`"#5291CE"`, `"rgb(0 128 0)"`, `"var(--my-color)"`). Le texte des onglets remplis passe automatiquement
en clair ou foncé selon la couleur.

```yaml
type: custom:customizable-tab-card
style: pills
alignment: stretch
tabs:
  - title: Salon
    icon: mdi:sofa
    color: amber
    cards:
      - type: tile
        entity: light.salon
  - title: Météo
    icon: mdi:weather-partly-cloudy
    color: "#5291CE"
    layout: grid
    columns: 2
    cards:
      - type: weather-forecast
        entity: weather.maison
      - type: sensor
        entity: sensor.temperature_exterieure
```

Les cartes d'un onglet ne sont créées qu'à sa première ouverture.

`test/preview.html` permet de prévisualiser la carte et l'éditeur hors de Home Assistant avec des cartes fictives.
