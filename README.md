# SocialFrame v2

Browser-based mockup tool voor social media advertenties. Genereert realistische phone-screenshots van LinkedIn, Facebook, Instagram en TikTok ads — direct downloadbaar als PNG of als ZIP met alle varianten tegelijk.

**Cloud-bibliotheek**: brand kits en designs worden in Supabase opgeslagen, beveiligd met één gedeeld team-wachtwoord. Iedereen met het wachtwoord ziet en bewerkt dezelfde content.

## Features

- **4 platforms** met écht andere layouts: LinkedIn / Meta / Instagram (icons + bijschrift) / TikTok
- **Format-presets**: 4:5, 1:1, 1.91:1, 9:16
- **Brand kits** — sla klanten één keer op (avatar, naam, URL, verified-badge), hergebruik overal
- **Multi-variant export** — checkboxes voor platforms × formaten × light/dark, één klik = ZIP met alles
- **Drag-and-drop + Cmd+V** voor afbeeldingen
- **Cloud-sync** via Supabase met password-gate

## Setup (alleen één keer per Supabase-project)

### 1. Tabellen aanmaken

In Supabase Dashboard → SQL Editor → plak en run de inhoud van [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).

### 2. Edge Function deployen

**Optie A — via de CLI (aanbevolen)**

```bash
# Eenmalig: install Supabase CLI als je hem nog niet hebt
brew install supabase/tap/supabase

# Vanuit deze repo:
supabase login
supabase link --project-ref lljnruyhireravkxtxrz
supabase functions deploy data --no-verify-jwt
```

**Optie B — via dashboard**

Supabase Dashboard → Edge Functions → "Deploy a new function" → naam `data` → plak inhoud van [`supabase/functions/data/index.ts`](supabase/functions/data/index.ts) → "Verify JWT" UIT → Deploy.

### 3. Team-wachtwoord instellen

Supabase Dashboard → Edge Functions → **Manage secrets** → New secret:
- Name: `SHARED_PASSWORD`
- Value: een wachtwoord naar keuze

Zonder deze secret weigert de Edge Function alle requests met een 500.

### 4. Frontend keys controleren

In `index.html` staan al ingevuld:

```js
const SUPABASE_URL = 'https://lljnruyhireravkxtxrz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

Beide zijn public (de publishable key is bedoeld om in de browser te staan). Pas alleen aan als je naar een ander Supabase-project migreert.

### 5. Site deployen

GitHub Pages → Settings → Pages → Source: `main` branch / `/ (root)` → Save.
Live binnen ~1 minuut op `https://erikotn.github.io/socialframe-v2/`.

Of dubbelklik gewoon `index.html` lokaal — werkt ook prima.

## Hoe het werkt (security-model)

```
[Browser] → [Edge Function: x-password header] → [Postgres: service-role key]
```

- De **publishable key** in de frontend mag iedereen lezen — die geeft alléén toegang tot de Edge Function URL
- De Edge Function checkt het `x-password` header tegen de `SHARED_PASSWORD` secret. Geen match → 401, geen DB-call
- Postgres-tabellen hebben **Row Level Security aan**, zonder policies → directe REST-calls naar Postgres lukken niet, ook niet als iemand de publishable key misbruikt
- Alleen de Edge Function kan via de service-role key bij data; alle clients moeten via de password-gate

**Wachtwoord rouleren**: Settings → Edge Functions → Secrets → bewerk `SHARED_PASSWORD`. Bestaande sessies in de browser werken niet meer — gebruikers moeten opnieuw inloggen.

## Beperkingen / verbeterpunten v3

- **Afbeeldingsgrootte**: foto's > 1500 px op de lange zijde worden client-side geresized. Anders zou de POST de Edge Function 6 MB body-limit overschrijden.
- **Geen audit-trail**: één gedeeld wachtwoord betekent dat je niet kunt zien wie welke kit heeft aangepast. Voor team-tools van 2–5 mensen prima; voor groter zou Supabase Auth (magic link) beter zijn.
- **Geen offline-mode**: alle data staat in de cloud. Geen netwerk → geen tool.

## Stack

- React 18 (CDN) + Tailwind CSS (CDN) + Babel-standalone
- FileSaver.js voor PNG-download, JSZip voor batch
- Supabase Postgres + Edge Functions (Deno) als backend
