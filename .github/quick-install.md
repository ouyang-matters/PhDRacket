## Quick install

**macOS** (Apple Silicon and Intel): open Terminal and run

```
curl -fsSL https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/install/install-macos.sh | bash
```

**Windows**: open PowerShell and run

```
irm https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/install/install-windows.ps1 | iex
```

The command downloads the latest release, checks it against the checksum published by GitHub and installs it. On macOS this avoids the *Open Anyway* step. If Racket is not installed, PhDRacket offers to install it on first launch.
