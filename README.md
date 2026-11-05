# CaseCircle

CaseCircle is an iPhone app for people waiting on the same immigration forms. It is a community, not a law firm and not a government service.

**Not affiliated with USCIS.** The suggested App Store subtitle is “Not affiliated with USCIS.” The app does not use a government seal or present itself as USCIS, DHS, or any other agency.

Posts and timelines in the app are other people’s experiences. They are not legal advice and they are not official processing times. Official times stay on the government site: [egov.uscis.gov/processing-times](https://egov.uscis.gov/processing-times/).

## What the app includes

- Five tabs: Home, Spaces, Ask, Timelines, and You. Ask is the center button.
- English and Spanish.
- Sign in with Apple, or an email address that stays on this device.
- Pseudonymous usernames. The app does not ask for receipt numbers, A-numbers, dates of birth, addresses, or document photos.
- Spaces for common forms. A person can join more than one, and a post can appear in up to three.
- A case profile per space: form, what it is based on, filing month, office, how it was filed, and current stage.
- Questions, timeline updates, interview notes, tips, and vents.
- Upvotes, bookmarks, helpful marks, and reports.
- Benchmarks that appear only after 20 people at the same office share a stage change. Smaller groups stay hidden.
- Sample stories that ship with the app so spaces are not empty. They are marked **Sample** / **Ejemplo**. They are not live posts from other people.
- Example benchmarks, also labeled as sample figures, not USCIS data.
- Quiet hours, a weekly on-device digest, and in-app notifications.
- Blocking, a report queue, and account deletion that replaces the name with “Deleted member.”

Support is [support@casecircle.app](mailto:support@casecircle.app).

## Requirements

- iOS app: Xcode, iOS 17 or later, iPhone, portrait only.
- Bundle id: `com.casecircle.app`. Display name: CaseCircle. Version 1.0.
- A development team in Signing & Capabilities before running on a physical iPhone. Sign in with Apple needs that team as well. Email sign-in and the review demo work without it.
- Mac preview: macOS 14 or later and the Swift command-line tools. This preview is a phone-sized window of the same screens. It is not the App Store build.

## Run it on a Mac without Xcode

From this folder:

```bash
swift build
.build/debug/CaseCircleMac
```

That opens the welcome screen. To skip sign-in and open the sample community as the reviewer:

```bash
.build/debug/CaseCircleMac -demo
```

On the last profile step, choose a **Current stage**, then tap **Save profile**. **Skip for now** opens the app without a case profile.

## Run it in Xcode

1. Open `CaseCircle.xcodeproj`.
2. Select the CaseCircle scheme and an iPhone simulator, or a connected iPhone.
3. In Signing & Capabilities, choose your development team.
4. Press Run.

Do not open `Package.swift` as the iOS app. That package builds the Mac preview and the logic checks.

## App Review demo

On the welcome screen, tap **App Review demo**. That creates or restores `app_review`, a moderator, with the launch spaces, a held scam post, and a post that already has two open reports. Reviewer notes are on the You tab for that account only.

A seeded attorney profile, `sol_review`, has the verified professional badge. People cannot grant that badge to themselves.

## Checks

Safety rules, usernames, similar-thread matching, and benchmark math live in `CaseCircle/Core` and are checked without the simulator:

```bash
swift run CaseCircleChecks
```

## Website

The browser app lives in `web/`. On a Mac, from that folder:

```bash
python3 serve.py 8766
```

Then open [http://127.0.0.1:8766/](http://127.0.0.1:8766/). That process serves the site and the folder language-model chat on loopback. Chat setup (exact environment variable names, OpenAI-compatible and xAI URLs, mock mode) is in [`web/README.md`](web/README.md). Do not put a provider key in the browser.

## Data

Accounts, posts, and case profiles are stored on the device as JSON. There is no server in this version. Deleting the app deletes that data. Sample stories are part of the app and are labeled as samples.

The app does not collect receipt numbers, A-numbers, Social Security numbers, passport numbers, dates of birth, street addresses, or photos of notices. Those are blocked before a post is published. Scam language is held for a moderator instead of appearing in the feed. Three open reports hide a post.
