# SocialFrame v2

Browser-based mockup tool voor social media advertenties. Genereert realistische phone-screenshots van LinkedIn, Facebook, Instagram en TikTok ads — direct downloadbaar als PNG of als ZIP met alle varianten tegelijk.

Geen build-step, geen backend. Eén `index.html` die overal te hosten is (GitHub Pages, Vercel, Netlify, of gewoon dubbelklikken).

## Wat is er nieuw t.o.v. v1

| Feature | v1 | v2 |
|---|---|---|
| Layouts | Feed (LinkedIn-stijl) + Story | LinkedIn / Meta / Instagram (icons + bijschrift) / TikTok |
| Format-presets | Sliders | Dropdown: 4:5, 1:1, 1.91:1, 9:16 |
| Brand kits | — | Tab voor klant-presets (avatar, naam, URL, verified) |
| Image upload | File-picker | File-picker + drag-and-drop + Cmd+V plakken |
| Export | 1 PNG per keer | ZIP met platforms × formaten × light/dark in één klik |
| Verified badge | — | Toggle per merk |
| Like/comment counts | — | Bewerkbaar |

## Lokaal draaien

Dubbelklik `index.html` of serveer met een eenvoudige static server:

```bash
python3 -m http.server 8000
# of
npx serve
```

## Deploy

**GitHub Pages**: Settings → Pages → Source: `main` branch / root → Save.
**Vercel**: import repo, framework = "Other", geen build command nodig.

## Stack

- React 18 (CDN, geen bundler)
- Tailwind CSS (CDN)
- Babel-standalone (in-browser JSX-compile)
- FileSaver.js (PNG-download)
- JSZip (batch-export)
- IndexedDB voor opslag van designs en brand kits (lokaal, in de browser)

## Verschil met v1 (`socialframe`)

v1 doet één LinkedIn-stijl feed-mockup heel goed. v2 generaliseert naar meerdere platforms en voegt workflow-features toe (brand kits, batch export). De code is grotendeels herschreven en deelt geen IndexedDB-store met v1.

## Roadmap

Mogelijke v3-toevoegingen:
- X / Twitter-layout (avatar-links is structureel anders)
- Carousel-mode (2–10 swipeable images)
- OG-import (URL plakken → auto-fill velden)
- Comment-preview onder de post
- Side-by-side vergelijking in één export
