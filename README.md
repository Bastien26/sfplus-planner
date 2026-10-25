# SF+ Planner

Calculateur de chaînes de production pour le mod **Satisfactory Plus** (SF+) de K-Mods.
Outil personnel, non officiel, en français, pour jouer entre potes sur un serveur dédié.

Le site est 100 % statique : tout tourne dans le navigateur, sans serveur.

## Ce qu'il fait

- **Produire** : tu choisis un ou plusieurs objets et un débit (/min). Le site calcule toute la chaîne jusqu'aux
  minerais : recettes, nombre de machines, % d'horloge de chaque machine, énergie (MW), ressources et surplus.
- **Maximiser** : tu donnes tes ressources (par exemple 2 gisements × 30/min de sitérite) et le site maximise la
  production. Option « X/min réservés pour une machine, le reste en stock ».
- **Sous-produits** : le solveur réutilise ceux qui servent (gangue, étain concassé…) et liste le surplus à envoyer au
  sink ou au stockage, avec les points de sink.
- **Progression** : tu coches le HUB, les paliers, les nœuds MAM et les disques durs débloqués, et seules ces recettes
  sont utilisées. L'onglet Recettes permet d'en forcer ou d'en retirer une.
- **Horloge** : 100 % maximum par défaut (début de partie). L'overclock monte jusqu'à 250 %. L'option « toutes les
  machines à 100 % » donne des nombres de machines entiers, sans sous-cadençage.
- **Splitters** : pour chaque objet envoyé à plusieurs endroits, un montage avec des splitters de base (1/2, 1/3) et des
  mergers, ou un manifold quand les machines s'équilibrent toutes seules.
- **Schéma** : la chaîne en diagramme, disposée automatiquement de haut en bas, sous-produits en pointillés. Export PNG.
- **Sauvegarde** : l'état est dans l'URL (« Partager le lien » pour l'envoyer à un pote) et dans le navigateur.
  Le menu « Sauvegardes » garde des calculs nommés.

## Lancer le site en local

Prérequis : [Node.js](https://nodejs.org) 20 ou plus.

```bash
npm install
npm run dev        # site de développement sur http://localhost:5173
npm test           # tests automatiques (données, solveur, splitters, schéma)
npm run build      # version de production dans dist/
npm run preview    # sert dist/ sur http://localhost:4173
```

## Les données

Toutes les données (recettes, objets, machines, déblocages, icônes) viennent de l'API JSON du wiki SF+
(`https://dev.k-mods.com/api/v2/wiki/raw/by-types?typeFilter=recipe|item|building|schematic`). C'est un export du
jeu fait par K-Mods.

```bash
npm run data           # télécharge l'export s'il a changé, régénère src/data/sfplus.json et les icônes
npm run data -- --force   # retélécharge tout
npm run data:build     # régénère sans réseau, depuis le cache
```

- Le script fait 5 appels à l'API, l'un après l'autre. L'export brut est mis en cache dans `data-raw/` (hors git).
  Les icônes sont téléchargées une seule fois (une toutes les 250 ms), puis réduites à 96 px dans `public/icons/`.
- Format interne (`src/data/sfplus.json`, types dans `src/data/types.ts`) : objets, machines, recettes (quantités
  par cycle, fluides en m³), schémas de déblocage. Ce format ne dépend pas de la source : un autre adaptateur
  (par exemple un export KDataForge du jeu) peut le produire, à côté de `scripts/data/adapters/wiki.ts`.
- Le script affiche un rapport : nombres, recettes écartées, anomalies.
- `tests/data.test.ts` vérifie 15 recettes relevées à la main sur le wiki. Si un test casse après une mise à jour,
  c'est que SF+ a changé ces recettes.

Version actuelle des données : **SF+ 2026.3.511** (export du wiki du 30/08/2026). La dernière version publique sur
ficsit.app est la 2026.3.489. Les recettes vérifiées sont identiques, mais d'autres ont pu bouger.

### Ce qui est gardé ou écarté

Sont gardées : les 549 recettes de production des machines (dont 134 alternatives), y compris celles des mods que SF+
impose (Ficsit Farming, Fluid Extras, Refined Power).

Sont écartées : les recettes de construction, les cosmétiques, les recettes faites seulement à l'établi,
l'extraction (mineurs, pompes, collecteurs d'air), les générateurs, et les recettes que K-Mods exclut de son propre
planificateur (convertisseurs de minerai…).

Les minerais, l'eau et l'air sont des ressources brutes : leur débit se saisit à la main.

## Comment ça calcule

- `src/solver/solve.ts` résout un programme linéaire avec [glpk.js](https://github.com/jvail/glpk.js) (GLPK en
  WebAssembly). Les objectifs sont pris l'un après l'autre :
  1. en mode Maximiser, la production maximale ;
  2. le moins de ressources brutes possible (l'eau et l'air comptent dix fois moins) ;
  3. le moins d'énergie possible.

  Le mode « tout à 100 % » utilise des nombres de machines entiers (MILP).
- Machines et horloge : `n = ⌈x / horloge max⌉`, `horloge = x / n`, `P = n × P0 × horloge^exposant`.
- `src/splitters/` : arbre exact de splitters 1/2 et 1/3 (plus petit découpage 2^a·3^b), ou manifold quand toutes les
  destinations sont des machines (une machine pleine renvoie l'excédent). Un sink ou un stock ne se remplit jamais :
  il est mis en bout de manifold, ou servi par un arbre exact.
- `src/diagram/` : graphe de la chaîne, mise en page avec [ELK](https://eclipse.dev/elk/), affichage avec
  [React Flow](https://reactflow.dev).

### Limites connues

- Les fluides passent par des tuyaux : aucun montage de splitters ne leur est proposé.
- La vitesse des tapis n'est pas vérifiée.
- Les somersloops ne sont pas gérés.
- La limite d'overclock réelle de chaque machine SF+ n'est pas sûre (les données indiquent 0 à 2 éclats selon la
  machine). Le réglage est donc global.
- Les noms d'objets restent en anglais : les données n'ont pas de traduction.

## Structure

```
scripts/data/        téléchargement (fetch-wiki), adaptateur wiki → format interne, icônes, rapport (run.ts)
src/data/            sfplus.json généré, types, index
src/solver/          modèle LP, GLPK (Node et navigateur), recettes par palier
src/splitters/       montage des splitters et répartitions
src/diagram/         schéma (graphe, mise en page, affichage)
src/ui/              composants de l'interface
src/state.ts         état du calculateur, lien de partage, localStorage
src/progression.ts   déblocages (HUB, paliers, MAM, disques durs)
tests/               tests Vitest
```

## Mise en ligne (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` construit et publie le site à chaque `push` sur `main` :

1. Crée un dépôt sur GitHub et pousse le code dessus.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le site est publié sur `https://<ton-compte>.github.io/<nom-du-dépôt>/`.

Les chemins sont relatifs (`base: "./"` dans `vite.config.ts`) : le site marche dans n'importe quel sous-dossier.

## Crédits et licences

- **Satisfactory Plus**, ses données et ses icônes appartiennent à [K-Mods](https://k-mods.com/).
  **Satisfactory** appartient à Coffee Stain Studios. Ce site est un outil de fan, à usage personnel.
- Bibliothèques :
  - [glpk.js](https://github.com/jvail/glpk.js) (GPL-3.0) ;
  - [elkjs](https://github.com/kieler/elkjs) (EPL-2.0) ;
  - [React Flow](https://github.com/xyflow/xyflow) (MIT) ;
  - React, Vite, Tailwind CSS, lz-string, html-to-image (MIT) ;
  - sharp (Apache-2.0, pour le script des icônes).
- glpk.js est sous GPL-3.0 : si tu publies le site, publie aussi son code source (dépôt public, par exemple).
