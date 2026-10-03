# Announcements

PhDRacket shows the announcements in `current.json` once, at startup, to
users whose app version, profile and date match. Edit the file on the `main`
branch to publish an announcement; installed copies read it from
`https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/announcements/current.json`.

Announcements are display-only: a title, plain text and at most one `https`
link. Users can turn them off in Settings.

```json
{
  "announcements": [
    {
      "id": "2026-10-beta-2",
      "title": "PhDRacket 0.1.0-beta.2 is available",
      "body": "This version fixes the Stepper for #lang htdp/bsl files. Use About, then Check for updates.",
      "link": { "label": "Release notes", "url": "https://github.com/ouyang-matters/PhDRacket/releases" },
      "minVersion": "0.1.0-beta.1",
      "maxVersion": "0.1.0-beta.1",
      "profiles": ["waterloo-cs145"],
      "until": "2026-12-31"
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | Yes | Unique identifier. Each announcement is shown once per id. |
| `title` | Yes | Up to 120 characters. |
| `body` | Yes | Plain text, up to 2000 characters. |
| `link` | No | One `https` link with a label. Other schemes are ignored. |
| `minVersion`, `maxVersion` | No | Show only to app versions in this range. |
| `profiles` | No | Show only to these profile ids, such as `waterloo-cs145`. |
| `until` | No | Show until this date, inclusive, in `YYYY-MM-DD` format. |
