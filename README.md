# Json Bonito

A Firefox extension that opens a beautiful, full-tab JSON formatter and editor when you click the toolbar icon.

## Why Json Bonito

**Your data stays on your machine.** Json Bonito processes everything locally in your browser — no data is ever sent to any server. Paste API responses, credentials, internal configs, or any sensitive payload without worrying about it leaving your machine.

**Fast.** It opens instantly as a browser tab and processes JSON using the browser's native engine. No loading screens, no network round-trips.

**Simple.** Paste JSON, press `Ctrl+Enter`. That's it.

**Free software.** Licensed under the BSD 2-Clause License. No accounts, no subscriptions, no telemetry.

## Features

- Format (pretty-print) and minify JSON
- Sort object keys alphabetically (recursively)
- Unescape JSON-encoded strings
- Real-time validation with line/column error reporting
- Copy, paste, and download output
- Dark and light theme (follows OS preference, manually overridable)
- Keyboard shortcuts: `Ctrl/Cmd+Enter` format, `Ctrl/Cmd+Shift+M` minify, `Ctrl/Cmd+Shift+K` sort keys

## Installation

1. Download or clone this repository
2. Open Firefox and go to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select `json-bonito-v4/manifest.json`

## License

BSD 2-Clause License
