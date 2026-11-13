# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue, discussion
or pull request.

**Preferred: GitHub private vulnerability reporting**

1. Go to the [Security tab](https://github.com/elcafe7/bible_scroller/security) of this repository.
2. Click **Report a vulnerability**
   ([direct link](https://github.com/elcafe7/bible_scroller/security/advisories/new)).
3. Describe the problem, the version you're using (for example `0.1.0`, or "live site"), and steps or a proof of concept to
   reproduce it.

Only the maintainer and you can see the report.

**If you can't use GitHub:** email [nate@jesuspeoplesf.com](mailto:nate@jesuspeoplesf.com) with the
subject "Security: Scroll" and the same details.

Please give us a chance to fix the problem before you share details publicly.

## Supported versions

Only the latest release and the live site get security fixes. Fixes ship as a new release, not as changes to old ones.

| Version | Supported |
|---|---|
| Latest release ([releases](https://github.com/elcafe7/bible_scroller/releases/latest)) | Yes |
| The live site, [apocalypse.press/scroll](https://apocalypse.press/scroll/) | Yes |
| Older releases | No. Please download the latest |

This covers the Scroll web app in this repository, the offline zip, and the site at [apocalypse.press/scroll](https://apocalypse.press/scroll/). The Bible texts are public domain and aren't security
issues unless they can be used to run code or read or write files they
shouldn't.

## What to expect

Scroll is maintained by one volunteer, so these are goals, not guarantees:

- **Acknowledgement:** within 7 days.
- **First assessment** (whether it's a vulnerability and how severe): within 14 days.
- **Fix:** for confirmed high or critical issues, we aim to release a fix
  within 30 days. Lower-severity issues are fixed in a later release.
- **Disclosure:** once a fix is released, we publish a GitHub security
  advisory and credit you if you'd like.

## How releases are checked

Every release is scanned and attested before it's published. See
[docs/RELEASE_VERIFICATION.md](docs/RELEASE_VERIFICATION.md) for how to check
a download, and [security/README.md](security/README.md) for the report from
each release.
