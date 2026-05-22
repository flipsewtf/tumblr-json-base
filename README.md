# tumblr-json-base

> [!IMPORTANT]  
> Work in progress. Not ready for use. html file will be added when ready.

A basecode for building Tumblr themes with NPF (Neue Post Format) rendering. Handles the full post
body — trail, reblogs, asks, images (inline and photosets), audio, video, polls, and inline
formatting — plus a lightbox, audio player, and common UI utilities.

## Accessibility

This codebase is built with accessibility as a baseline, not an afterthought:

- Lightbox is a proper `role="dialog"` with focus trapping, focus return on close, and full keyboard
  navigation (arrow keys, Escape).
- Audio player controls have `aria-label` attributes and live region announcements.
- Photosets use `role="group"` with an `aria-label` when more than one image is present.
- Poll blocks use `role="region"` and individual vote links have descriptive `aria-label`
  attributes.
- Deactivated and unavailable blogs are indicated via `data-tooltip` and `aria-label` rather than
  just visual styling.
- Deactivated/unavailable blog names strip the -deactivated suffix for cleaner screen reader
  announcements.
- The tooltip system preserves `title` attributes and restores them on mouse leave, so screen
  readers still get the text.
- Inline images have alt text from NPF alt_text where available, falling back to empty alt="" rather
  than omitting the attribute.
- Video iframes have aria-label identifying the provider.

Contributions that regress accessibility **will not** be accepted.

## Installation

Upload the files via **Theme assets**. Tumblr will give you a CDN URL for each one. Then add them to
your theme before `</body>`, in this order:

```html
<script src="post.js"></script>
<script src="renderer.js"></script>
<script src="ui.js"></script>
```

Order matters — `post.js` must come before `renderer.js`.

`ui.js` is optional but contains the tooltip system, which the renderer uses for
deactivated/unavailable blog indicators. You can drop the rest of `ui.js` and keep just the tooltip
code if you prefer, or add your own theme-specific scripts in it.

## Credit

If you use this codebase in your theme, you must include a visible credit link back to either:

- This repo: `https://github.com/flipsewtf/tumblr-json-base`
- or [mournstera.tumblr.com](https://mournstera.tumblr.com)

In your theme file and/or credit page.

## Files

| File          | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `post.js`     | Lightbox and native audio player. Must load before renderer.js. |
| `renderer.js` | NPF renderer. Parses post JSON and builds the DOM.              |
| `ui.js`       | UI utilities — tooltips, dark mode, scroll-to-top, etc.         |
| `index.html`  | Base HTML template to build your theme from.                    |

## How it works

### Post data

NPF data is embedded in a hidden `<div>` containing `{NPF}` rather than `{JsNPF}` in a `<script>`
tag. This is intentional for two reasons:

1. **Preserves emoji** — `{JsNPF}` strips emoji characters on the live blog.
2. **Works in Tumblr's preview sandbox** — `<script>` tag contents are treated differently in
   preview and cause empty posts.

The tradeoff is that the browser parses the div contents as HTML, which produces console errors for
posts with messy `embed_html` (e.g. Instagram). These errors are harmless — posts still render
correctly!

(The console for Tumblr is messy anyways.)

### Static pages

Custom static pages (e.g. `/about`, `/faq`) send empty NPF in both the preview sandbox and on the
live blog — Tumblr does not populate `{NPF}` for them. To work around this, the template includes a
hidden div with a `<template>` tag containing `{Body}`:

```html
<div class="page_body_raw" hidden aria-hidden="true"><template>{Body}</template></div>
```

The `<template>` tag keeps the content inert — the browser does not render or execute it, so iframes
and other embeds inside `{Body}` do not load. For posts, `{Body}` outputs nothing for
photo/video/audio types, so the template is empty and there is no overhead.

`buildPageFallback()` in `renderer.js` reads from this template and remaps the raw HTML to theme
classes — `<h2>` becomes `<h3 class="post-heading2">`, `<ul>` gets `post-ul`, and so on. Any class
names the user added in the page editor are preserved alongside the theme classes.

Ask and submit pages are excluded from `buildPageFallback()` entirely. They use hardcoded
`{block:AskPage}` and `{block:SubmitPage}` template blocks instead, because Tumblr's iframe resize
script needs to control the ask/submit form iframes directly — routing them through JS breaks the
responsive height behaviour.

The page title is sourced from `{Title}` via a `data-page-title` attribute on the article element
and prepended as an `<h2 class="post-heading1">` when present.

### User headers

The root/original poster's avatar and username are rendered into `<header class="post-header">`
_outside_ `section.post-content`. This allows different styling for the root poster (larger avatar,
different layout, pinned content alongside, etc.) compared to trail entries, which render inside the
post body.

For the blog owner's own posts, `blogName`/`blogUrl` from Tumblr template variables are used since
`{JSName}` is always current. For reblogs, `trail[0].blog` is used instead, which reflects what
Tumblr had on record at post time and may be stale. If the root blog is unavailable,
`broken_blog_name` is used with no link.

### Lightbox

`post.js` exposes `window.openLightbox(images, index)` which `renderer.js` calls when a photoset
image is clicked. Images and GIFs both use it. Supports keyboard navigation (arrow keys, Escape) and
focus trapping.

### Audio player

Native Tumblr audio posts (`provider: "tumblr"`) get a custom player built by `post.js` -
play/pause, scrubber, and timestamp. The `<audio>` element is hidden and wired up after render.

### Instagram embeds

Instagram embeds use a fixed aspect ratio wrapper (116.11% padding-bottom) mirroring Tumblr's own
dashboard approach. The declared dimensions in the NPF data are not always accurate so the sizing
may be slightly off depending on caption length — this is a known limitation shared with Tumblr's
own rendering. Instagram's embed sizing is controlled by Meta and cannot be overridden from outside
the iframe.

## Ask blocks

The ask/answer structure is built in JS and can be restyled entirely with CSS — Grid and Flexbox go
a long way before you need to touch the markup. If you do want to restructure the HTML, that's in
`renderer.js` under `buildAskThread()`.

## ui.js

The utilities in `ui.js` are a mix of universal and theme-specific code. What's safe to use as-is:

- **Tooltips** — reads `data-tooltip` or `title` attributes, works across the whole page. Exposes
  `window.bindTooltipNode(el)` for dynamically added content.
- **Dark mode toggle** — three-way cycle: light → dark → system.
- **Scroll to top** — shows after 30px of scroll, smooth scrolls back.
- **Note count formatting** — shortens note counts in `.notecount` elements (e.g. `1200` → `1k`).

Theme-specific sections for showcasing:

- **Post tag toggles** — hidden/truncated tag behavior tied to `<html>` classes set by your theme
  options.
- **Tumblr controls** — the iframe toggle for Tumblr's built-in controls bar, positioned by your
  theme's CSS.

## Using this as a base

This repo is intentionally minimal — it handles rendering and common interactions but makes no
assumptions about CSS or layout. Build your theme's styles on top of the class names the renderer
outputs.

## Key class names from the renderer

| Class                       | What it is                                            |
| --------------------------- | ----------------------------------------------------- |
| `.user-header`              | Blog avatar + username row                            |
| `.user-header__avatar`      | Avatar image container                                |
| `.user-header__name`        | Blog name link                                        |
| `.user-header__original`    | Original post author header (article header)          |
| `.user-header__root`        | Root post author in a reblog chain (article header)   |
| `.user-header__trail`       | Reblog trail author header (inside post content)      |
| `.post_body`                | Wrapper for post or trail entry content               |
| `.post_block__photo`        | Single image, photoset container, or inline image     |
| `.post_block__photoset`     | Photoset grid                                         |
| `.post_block__inline_image` | Inline image below 350px                              |
| `.post_block__link`         | Link post                                             |
| `.post_block__audio`        | Audio block figure                                    |
| `.post_block__video`        | Video block container                                 |
| `.post_block__poll`         | Poll container                                        |
| `.post_block__ask`          | Ask or answer body                                    |
| `.ask__container`           | Full ask/answer block including header                |
| `.is_root`                  | First entry in reblog trail (applied to `.post_body`) |
| `.is_trail`                 | Reblog trail entries (applied to `.post_body`)        |

To explore the full output, open your browser's DevTools and inspect a rendered post — the DOM is
the documentation. Every class name the renderer produces will be visible there.

### A note on legacy post types

This basecode does not mimic the old Tumblr legacy layout. While I love the nostalgia myself -
moving the root poster's header below the first media (photoset, for example) — it comes at a cost:
the visual order no longer matches the DOM order, which is confusing for screen readers and keyboard
navigation, and general overview of a blog.

## Credits

SVG icons: [Lucide](https://lucide.dev/) and [Tabler](https://tabler.io/icons).

Euclid’s GCD: inspired by a GCD approach from
[this post](https://gist.github.com/zlw5009/2b886c3b87f964fde865b59dde19c685), adapted for this
project by [Mads](https://bsky.app/profile/Madsshule.bsky.social), as well as Node builder reg
simplification.

## License

MIT — Flipse / [@mournstera](https://mournstera.tumblr.com)
