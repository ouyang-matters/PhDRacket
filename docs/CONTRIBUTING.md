# Contributing

## Development setup

Install:

- Racket 9.3, standard distribution (includes htdp-lib)
- Rust, stable toolchain
- Node.js 20 or later, and pnpm
- The [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
  operating system

Then:

```bash
pnpm install
```

```bash
raco make backend/racket/phdracket-bridge.rkt
```

```bash
pnpm tauri dev
```

If the repository is on a cloud-synced or network drive, set
`CARGO_TARGET_DIR` to a local folder so build output is not synchronized. The
repository's `.npmrc` uses a flat `node_modules` layout because such drives
often do not support symbolic links.

## Before submitting a change

```bash
raco test compatibility-tests/bridge-tests.rkt
```

```bash
cargo test -p phdracket-core
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

Changes to the user interface should also pass the end-to-end test described
in [Testing](TESTING.md).

## Rules

1. **Check upstream first.** If Racket, DrRacket or htdp-lib already provides
   a behavior, call it. When code mirrors an upstream file, name that file in
   a comment.
2. **Racket decides semantics.** Evaluation logic belongs only in Racket, never
   in the user interface or the Rust backend.
3. **Isolate internal interfaces.** Internal htdp-lib and DrRacket interfaces
   are used only in `backend/racket/`, behind a small adapter, and are listed
   in [Compatibility](COMPATIBILITY.md) or [Stepper](STEPPER.md).
4. **Never modify source files for the IDE's convenience.** Only the user's
   own edits are ever written to a `.rkt` file.
5. **Test before claiming compatibility.** Add corpus programs and expected
   transcripts, and review every change to an expected file against DrRacket.
6. **Keep interface text short.** Explanations belong in `docs/`.
7. **Respect licenses.** Before adapting code from Racket or any other
   project, check its license and record the source in
   `THIRD_PARTY_NOTICES.md`.

The corpus contains small programs written for testing. Never add course
assignment solutions to it.

Pull requests that add code generation, AI completion, solution suggestions
or integration with grading systems will not be accepted.

## Releases

Releases are built by `.github/workflows/release.yml` when a version tag is
pushed.

1. Set the same version in `Cargo.toml` (`workspace.package.version`),
   `package.json` and `apps/desktop/src-tauri/tauri.conf.json`. Test releases
   use versions such as `0.1.0-beta.2`.
2. Commit, then create and push a tag with the same version:

   ```bash
   git tag v0.1.0-beta.2
   ```

   ```bash
   git push origin main v0.1.0-beta.2
   ```

3. The workflow builds the Windows installer and the universal macOS disk
   image, publishes them as a GitHub pre-release, and copies the update
   manifest (`latest.json`) to the `updater` branch. Installed copies read
   that branch to find new versions.
4. The *Install scripts* workflow then attaches `install/install-windows.ps1`
   and `install/install-macos.sh` to the release and adds the one-line
   install commands (`.github/quick-install.md`) to its notes. It also runs
   whenever the scripts change on `main`.

Update files are signed. The workflow reads the private signing key from the
repository secret `TAURI_SIGNING_PRIVATE_KEY`. The matching public key is in
`tauri.conf.json`. Keep a backup of the private key: without it, installed
copies cannot verify new updates, and every user would have to reinstall.

The Windows installer and the macOS application are not yet signed with a
code-signing certificate or notarized, so Windows SmartScreen and macOS
Gatekeeper show a warning on first launch. The installation steps in the
README explain how to proceed.

## Beta Terms of Use

`docs/TERMS.md` is the only source of the Terms. The app shows it in Setup
and About, and the Windows installer shows a plain-text copy on its license
page. After changing the Terms:

1. Update the *Last Updated* line. A new date asks every user to accept the
   Terms again the next time they start PhDRacket.
2. Regenerate the installer copy:

   ```bash
   pnpm terms
   ```

A test fails if the installer copy differs from `docs/TERMS.md`.

## Announcements

To show a notice to users, add an entry to `announcements/current.json` on
the `main` branch. Installed copies read the file at startup and show each
announcement once. `announcements/README.md` describes the fields, including
version, profile and date filters. Keep announcements short and factual, and
use them sparingly.
