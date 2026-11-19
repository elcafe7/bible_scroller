# Contributing to Scroll

Thanks for helping. This covers the Scroll web app and its offline zip.

## Questions, bugs and ideas

Use [GitHub Issues](https://github.com/elcafe7/bible_scroller/issues):

- **Bug:** [open an issue](https://github.com/elcafe7/bible_scroller/issues/new) and say what you did, what you
  expected, and what happened instead. Include your browser or OS and the
  version or release you're using.
- **Idea or enhancement:** open an issue describing what you'd like and why.
- **Question:** open an issue and add the `question` label. There's no
  separate forum.

Please search the [existing issues](https://github.com/elcafe7/bible_scroller/issues?q=is%3Aissue) first.

**Security problems:** don't open a public issue. Follow
[SECURITY.md](SECURITY.md) to report it privately.

## Making a change

1. For anything bigger than a small fix, open an issue first so we can agree
   on the approach.
2. Fork the repository and create a branch from `main`.
3. Make your change, with tests for any new behavior.
4. Run the checks below.
5. Open a [pull request](https://github.com/elcafe7/bible_scroller/pulls) against `main` and describe what changed
   and why. Link the issue it fixes. Draft pull requests are welcome.

`main` is protected. Every change, including the maintainer's own, goes in
through a pull request that passes the required checks. The maintainer
reviews each pull request and may ask for changes before merging.

## Setting up

Needs Node 22.13 or newer.

```sh
npm ci
```

## Checks to run before opening a pull request

```sh
npm test          # unit tests (Vitest)
npm run build     # type check (tsc --noEmit) and production build
```
Without the generated `data/` folder, builds and tests use the John 1 fixture.

## Continuous integration

Every pull request runs **CodeQL** (GitHub code scanning), and it must pass
before merging. The type check and unit tests run locally (above) and again in
the release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)),
which won't publish a release unless they pass.

## Requirements for contributions

- TypeScript in strict mode (`tsconfig.json`). `npm run build` must type-check
  with no errors. Follow the style of the code around your change.
- Please open an issue before changing how the app looks or what it says.
- Don't add runtime dependencies without discussing it in an issue first.
- Don't commit Bible databases, generated `data/`, credentials or other secrets.
- Add or update tests for new features and bug fixes where practical.
- Update the README or docs if you change how something is used.
- Keep each pull request to one topic.

## Sign-off and license

No Developer Certificate of Origin (DCO) sign-off and no contributor license
agreement are needed. By opening a pull request you agree that your
contribution is licensed under the project's [MIT License](LICENSE).
