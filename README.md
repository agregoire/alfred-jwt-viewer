# JWT Viewer for Alfred

Type `jwt <token>` in Alfred to decode a JSON Web Token.

- The first row tells you if the token is expired, not valid yet, or still valid.
- The next rows show the full payload and header as JSON.
- Then each claim gets its own row. Numbers that look like Unix timestamps
  (like `exp`, `iat`, `nbf`) are shown as dates in your local timezone.

You can paste the token with a `Bearer ` prefix or surrounding quotes. It still works.

The signature is **not** verified. This only decodes.

## Keys

| Key | Action |
| --- | --- |
| `↵` | Copy the value (dates copy as readable text, JSON rows copy pretty JSON) |
| `⌘↵` | On a date: copy the raw Unix timestamp |
| `⌥↵` | On a date: copy it as ISO 8601 in UTC |
| `⌘L` | Show the value in Large Type |
| `⌘C` | Copy the value |

## Install

```sh
./build.sh
open dist/JWT-Viewer.alfredworkflow
```

No dependencies. It uses JavaScript for Automation, which ships with macOS.
