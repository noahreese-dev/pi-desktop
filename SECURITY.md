# Security

Pi Desktop runs your Pi harnesses with your full user permissions, exactly as a terminal would. It adds no sandbox
around them. What it does guard is the boundary between the web page and your Mac; see
[docs/ARCHITECTURE.md#security-model](docs/ARCHITECTURE.md#security-model).

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's **Report a vulnerability** button on the repository's Security tab
(private advisory). Include what you found, how to reproduce it, and the macOS / Node / Electron versions.
You'll get a reply within a week.

In scope: anything that lets the page (or content shown in it: model output, files, links) read files outside
`safePath()`, run commands, reach Node APIs, or navigate the window away from `app/index.html`.
