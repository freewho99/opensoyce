# OpenSoyce Trust Badge

The OpenSoyce Trust Badge embeds the public trust posture for a repository in any README.

The badge **points to** the trust record. It does not become the trust record.

The canonical badge URL is the source of truth. Copying the SVG to a third-party host produces a screenshot, not an OpenSoyce badge.

## Recommended embed

```markdown
[![OpenSoyce Trust](https://opensoyce.com/badge/<owner>/<repo>/posture.svg)](https://opensoyce.com/projects/<owner>/<repo>/trust)
```

Example for this repository:

```markdown
[![OpenSoyce Trust](https://opensoyce.com/badge/freewho99/opensoyce/posture.svg)](https://opensoyce.com/projects/freewho99/opensoyce/trust)
```

The link target is the per-repo Trust Dashboard. The link survives the image: if the dashboard URL ever changes, the old path responds with a redirect to the new one.

## Posture vocabulary

The badge renders one of five labels:

| Label | Meaning |
|---|---|
| `USE READY` | The trust record marks the repo as use-ready. |
| `WATCHLIST` | The trust record marks the repo as watchlist. |
| `RISKY` | The trust record marks the repo as risky. |
| `GRAVEYARD` | The trust record marks the repo as graveyard. |
| `NOT EVALUATED` | The repo has no recorded posture. |

`NOT EVALUATED` is a first-class state. It does not mean "coming soon", "we will evaluate", or "evaluation in progress". It means the trust record has nothing to say about this repo today.

## JSON sibling

For machine consumers (CI, dashboards, scripts), the same posture is available as JSON:

```
GET https://opensoyce.com/badge/<owner>/<repo>/posture.json
```

Response shape:

```json
{
  "owner": "freewho99",
  "repo": "opensoyce",
  "postureLabel": "watchlist",
  "postureText": "WATCHLIST",
  "source": "static-mvp",
  "fetchedAt": "2026-06-06T...",
  "proofAnchor": {
    "proofType": "live-surface",
    "label": "/projects/freewho99/opensoyce/trust",
    "href": "/projects/freewho99/opensoyce/trust"
  }
}
```

The JSON sibling shares the posture lookup with the SVG. A repo cannot show one posture in SVG and a different one in JSON.

For unknown repos, `postureLabel` is `null` and `postureText` is `NOT EVALUATED`. The HTTP status is `200 OK` in both cases.

## Embed variants

The canonical Markdown embed above is the recommended form. The badge also renders correctly inside:

| Form | Embed |
|---|---|
| HTML | `<a href="https://opensoyce.com/projects/<owner>/<repo>/trust"><img src="https://opensoyce.com/badge/<owner>/<repo>/posture.svg" alt="OpenSoyce Trust" /></a>` |
| reStructuredText | `.. image:: https://opensoyce.com/badge/<owner>/<repo>/posture.svg` followed by `:target: https://opensoyce.com/projects/<owner>/<repo>/trust` |
| JSON consumer | `GET https://opensoyce.com/badge/<owner>/<repo>/posture.json` |

## What the badge does not do

- The badge does not customize. There is no `?style=`, `?theme=`, or `?color=` query string.
- The badge does not run scripts. The SVG contains no `<script>`, `<iframe>`, or `<foreignObject>` elements.
- The badge does not embed analytics. The SVG fetches no external resources at render time.
- The badge does not sign its response in v0. Anti-forgery in v0 relies on the canonical URL and the link to the Trust Dashboard.
- The badge does not synthesize a posture. Unknown repos render `NOT EVALUATED`, never a guessed posture.

## Headers

| Header | Value |
|---|---|
| `Content-Type` | `image/svg+xml; charset=utf-8` (SVG) / `application/json; charset=utf-8` (JSON) |
| `Cache-Control` | `public, max-age=300, stale-while-revalidate=3600` |
| `ETag` | Stable per (owner, repo, posture-key) |
| `X-OpenSoyce-Posture-Source` | `static-mvp` in v0 (widens when the live Trust Vault ships) |

`If-None-Match` short-circuits unchanged responses with `304 Not Modified`.

## Trust record

The full trust record for OpenSoyce lives at https://opensoyce.com/opensource-trust. The badge points there; the badge does not replace what lives there.
