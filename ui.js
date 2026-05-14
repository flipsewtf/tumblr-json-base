// -------------------- TOOLTIPS --------------------
// tooltip-nowrap: class applied to containers with fixed-position
// elements (e.g. corner controls). Tooltips inside use fixed
// positioning + clientX/Y instead of absolute + pageX/Y,
// and account for the scrollbar gutter width when clamping
// to the viewport edge:
// `const NOWRAP_CONTAINER = 'tooltip-nowrap';`

(function () {
    'use strict';

    const NOTES_SELECTOR = 'ol.notes';
    const NOWRAP_CONTAINER = 'tooltip-nowrap';
    const PADDING = 12;
    const MAX_WIDTH = 280;
    const H_OFFSET = 8;
    const V_OFFSET = 6;
    const SCROLLBAR_WIDTH = 16;

    const tooltip = document.createElement('div');
    tooltip.className = 'mournstera-tooltip';
    document.body.appendChild(tooltip);

    let activeEl = null;

    function bind(el) {
        el.addEventListener('mouseover', onEnter);
        el.addEventListener('mouseout', onLeave);
        el.addEventListener('mousemove', onMove);
    }

    function scanNode(node) {
        if (!(node instanceof HTMLElement)) return;
        if (node.hasAttribute('title') || node.hasAttribute('data-tooltip')) bind(node);
        node.querySelectorAll?.('[title],[data-tooltip]').forEach(bind);
    }

    window.bindTooltipNode = scanNode;

    function onEnter(event) {
        const el = event.currentTarget;
        const text = el.getAttribute('data-tooltip') || el.getAttribute('title');
        if (!text) return;

        activeEl = el;

        if (el.hasAttribute('title')) {
            el.dataset.title = text;
            el.removeAttribute('title');
        }

        tooltip.textContent = text;

        if (el.closest(`.${NOWRAP_CONTAINER}`)) {
            tooltip.classList.add('nowrap-tooltip');
        } else {
            tooltip.classList.remove('nowrap-tooltip');
        }

        tooltip.classList.add('is-active');
    }

    function onMove(event) {
        if (!activeEl) return;

        const viewportWidth = document.documentElement.clientWidth;

        tooltip.style.left = '-9999px';
        tooltip.style.top = '0px';
        tooltip.style.visibility = 'hidden';
        tooltip.style.maxWidth = '';

        if (!tooltip.classList.contains('nowrap-tooltip')) {
            tooltip.style.maxWidth = Math.min(MAX_WIDTH, viewportWidth - 2 * PADDING) + 'px';
        }

        tooltip.classList.add('is-active');

        const rect = tooltip.getBoundingClientRect();
        const isNowrap = tooltip.classList.contains('nowrap-tooltip');

        tooltip.style.position = isNowrap ? 'fixed' : 'absolute';

        let left = (isNowrap ? event.clientX : event.pageX) + PADDING + H_OFFSET;
        let top = (isNowrap ? event.clientY : event.pageY) - rect.height - PADDING - V_OFFSET;

        if (event.clientY - rect.height - PADDING - V_OFFSET < PADDING) {
            top = (isNowrap ? event.clientY : event.pageY) + PADDING + V_OFFSET * 3;
        }

        if (
            left + rect.width + PADDING >
            (isNowrap ? viewportWidth : window.scrollX + viewportWidth)
        ) {
            const gutterOffset = isNowrap ? SCROLLBAR_WIDTH : 0;
            left =
                (isNowrap ? 0 : window.scrollX) +
                viewportWidth -
                gutterOffset -
                rect.width -
                PADDING;
        }

        if (left < (isNowrap ? 0 : window.scrollX) + PADDING) {
            left = (isNowrap ? 0 : window.scrollX) + PADDING;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.visibility = 'visible';
    }

    function onLeave(event) {
        const el = event.currentTarget;

        if (el.dataset.title) {
            el.setAttribute('title', el.dataset.title);
            delete el.dataset.title;
        }

        activeEl = null;
        tooltip.classList.remove('is-active');
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(scanNode);
        }
    });

    function initNotesObserver() {
        const notes = document.querySelector(NOTES_SELECTOR);
        if (!notes) return false;

        scanNode(notes);
        observer.observe(notes, { childList: true, subtree: true });

        return true;
    }

    const timer = setInterval(() => {
        if (initNotesObserver()) clearInterval(timer);
    }, 300);

    scanNode(document.body);

    const tooltipObserver = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            if (m.type === 'attributes' && m.attributeName === 'data-tooltip') {
                if (activeEl && m.target === activeEl) {
                    tooltip.textContent = activeEl.getAttribute('data-tooltip') || '';
                }
            }
        });
    });

    tooltipObserver.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-tooltip'],
    });
})();

// -------------------- DARK MODE --------------------
// localStorage inside <head> with is:inline

(() => {
    const buttons = document.querySelectorAll('.theme-toggle');
    if (!buttons.length) return;

    const root = document.documentElement;
    const storageKey = 'theme-mode';

    const getStoredMode = () => localStorage.getItem(storageKey) || 'system';

    const getSystemTheme = () =>
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    const resolveTheme = (mode) => {
        if (mode === 'system') return getSystemTheme();
        return mode;
    };

    const getTooltipText = (mode) => {
        if (mode === 'system') return 'System theme';
        return mode === 'dark' ? 'Dark theme' : 'Light theme';
    };

    const applyTheme = (mode) => {
        const theme = resolveTheme(mode);

        root.classList.add('no-transition');
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-theme-mode', mode);

        buttons.forEach((btn) => {
            btn.setAttribute('aria-label', getTooltipText(mode));
            btn.setAttribute('data-tooltip', getTooltipText(mode));
        });

        setTimeout(() => {
            root.classList.remove('no-transition');
        }, 50);
    };

    const setMode = (mode) => localStorage.setItem(storageKey, mode);

    let mode = getStoredMode();
    applyTheme(mode);

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const current = getStoredMode();

            const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';

            setMode(next);
            applyTheme(next);
        });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getStoredMode() === 'system') {
            applyTheme('system');
        }
    });
})();

// -------------------- TUMBLR CONTROLS --------------------

(function () {
    'use strict';

    const controls = document.querySelector('button.tumblr-controls');
    if (!controls) return;

    controls.addEventListener('click', function () {
        const isPressed = controls.classList.contains('pressed');

        controls.classList.toggle('pressed', !isPressed);
        controls.setAttribute('aria-expanded', String(!isPressed));
        controls.setAttribute(
            'aria-label',
            !isPressed ? 'Close Tumblr controls' : 'Open Tumblr controls',
        );

        const tooltipText = !isPressed ? 'Close Tumblr controls' : 'Open Tumblr controls';
        controls.setAttribute('data-tooltip', tooltipText);

        const tooltipEl = document.querySelector('.mournstera-tooltip');
        if (tooltipEl && tooltipEl.classList.contains('is-active')) {
            tooltipEl.textContent = tooltipText;
        }

        const iframe = document.querySelector('iframe.tmblr-iframe');
        if (iframe) {
            iframe.classList.toggle('pressed', !isPressed);
            iframe.setAttribute('aria-hidden', String(isPressed));
        }

        document.querySelector('.theme-toggle')?.classList.toggle('hide');
    });
})();

// -------------------- SCROLL TO TOP --------------------

const html = document.documentElement;
const scrollButton = document.querySelector('.scroll-to-top');

if (scrollButton) {
    document.addEventListener('scroll', function () {
        const isVisible = html.scrollTop > 30;
        scrollButton.classList.toggle('visible', isVisible);
        scrollButton.setAttribute('aria-hidden', String(!isVisible));
    });

    scrollButton.addEventListener('click', function () {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    });
}

// -------------------- COPY CLIPBOARD --------------------

document.querySelectorAll('[aria-label="Copy link to post"]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        const span = btn.querySelector('span');

        navigator.clipboard
            .writeText(url)
            .then(() => {
                span.textContent = 'Copied!';
                setTimeout(() => (span.textContent = 'Copy link'), 2000);
            })
            .catch(() => {
                span.textContent = 'Failed';
                setTimeout(() => (span.textContent = 'Copy link'), 2000);
            });
    });
});

// -------------------- POST TAGS --------------------

document.addEventListener('DOMContentLoaded', () => {
    // -------------------- BEHIND TOGGLE

    if (
        document.documentElement.classList.contains('tags--hidden') &&
        !document.documentElement.classList.contains('permalink_page')
    ) {
        const toggleTagsElements = document.querySelectorAll('.toggle-tags');

        toggleTagsElements.forEach(function (element) {
            element.addEventListener('click', function (event) {
                const article = this.closest('article');
                if (!article) return;

                const tagsContainer = article.querySelector('.tags-container');
                if (!tagsContainer) return;

                const computedMaxHeight = window.getComputedStyle(tagsContainer).maxHeight;
                const isOpen = computedMaxHeight !== '0px' && computedMaxHeight !== 'none';

                if (isOpen) {
                    tagsContainer.style.maxHeight = `${tagsContainer.scrollHeight}px`;
                    setTimeout(() => {
                        tagsContainer.style.maxHeight = '0px';
                    }, 10);
                } else {
                    tagsContainer.style.maxHeight = `${tagsContainer.scrollHeight}px`;
                }

                this.classList.toggle('active');
                this.setAttribute('aria-expanded', String(!isOpen));
                this.setAttribute('aria-label', !isOpen ? 'Hide tags' : 'Show tags');
                this.setAttribute('data-tooltip', !isOpen ? 'Hide Tags' : 'Show Tags');
                event.preventDefault();
            });
        });
    }

    // -------------------- TAGS TRUNCATED

    if (
        document.documentElement.classList.contains('tags--truncated') &&
        !document.documentElement.classList.contains('permalink_page')
    ) {
        const maxVisibleTags = 4;

        const containers = document.querySelectorAll('.tags--truncated .tags-container .tags');

        containers.forEach((tagsContainer) => {
            const tags = tagsContainer.querySelectorAll('a');

            if (tags.length > maxVisibleTags) {
                tags.forEach((tag, index) => {
                    if (index < maxVisibleTags) {
                        tag.classList.add('is-visible');
                        tag.style.display = 'inline';
                    } else {
                        tag.style.display = 'none';
                    }
                });

                const lastVisibleTag = tags[maxVisibleTags - 1];
                if (lastVisibleTag) lastVisibleTag.classList.add('ellipsis');

                const expandLink = document.createElement('a');
                expandLink.href = '#expand';
                expandLink.className = 'expand';
                expandLink.textContent = 'see all';

                expandLink.setAttribute('role', 'button');
                expandLink.setAttribute('aria-expanded', 'false');
                expandLink.setAttribute('tabindex', '0');

                tagsContainer.appendChild(expandLink);

                expandLink.addEventListener('click', function (event) {
                    event.preventDefault();

                    tags.forEach((tag) => {
                        tag.style.display = 'inline';
                    });

                    if (lastVisibleTag) lastVisibleTag.classList.remove('ellipsis');

                    expandLink.setAttribute('aria-expanded', 'true');
                    expandLink.remove();

                    const liveRegion = tagsContainer.querySelector('.sr-live');
                    if (liveRegion) liveRegion.textContent = 'All tags are now visible.';
                });

                expandLink.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        expandLink.click();
                    }
                });
            } else {
                tags.forEach((tag) => {
                    tag.classList.add('is-visible');
                    tag.style.display = 'inline';
                });
            }
        });
    }
});

// -------------------- FORMAT TIMESTAMP --------------------
// configure and initialize in the html document

(function () {
    const UNITS = [
        { label: 'now', limit: 10 },
        { label: 's', limit: 60, divisor: 1 },
        { label: 'm', limit: 3600, divisor: 60 },
        { label: 'h', limit: 86400, divisor: 3600 },
        { label: 'd', limit: 604800, divisor: 86400 },
        { label: 'w', limit: 2620800, divisor: 604800 },
        { label: 'mo', limit: 31449600, divisor: 2620800 },
        { label: 'y', limit: Infinity, divisor: 31449600 },
    ];

    const SHORT = { s: 'sec', m: 'min', h: 'hr', d: 'day', w: 'wk', mo: 'mo', y: 'yr' };
    const WORD = {
        s: 'second',
        m: 'minute',
        h: 'hour',
        d: 'day',
        w: 'week',
        mo: 'month',
        y: 'year',
    };
    const ONES = [
        '',
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        'nine',
        'ten',
        'eleven',
        'twelve',
        'thirteen',
        'fourteen',
        'fifteen',
        'sixteen',
        'seventeen',
        'eighteen',
        'nineteen',
    ];
    const TENS = [
        '',
        '',
        'twenty',
        'thirty',
        'forty',
        'fifty',
        'sixty',
        'seventy',
        'eighty',
        'ninety',
    ];

    function toWords(n, spaces) {
        if (n < 20) return ONES[n];
        if (n < 100) {
            const t = TENS[Math.floor(n / 10)];
            const o = ONES[n % 10];
            return o ? (spaces ? t + ' ' + o : t + o) : t;
        }
        return 'out of range!';
    }

    function format(timestamp, settings) {
        const diff = Math.floor(Date.now() / 1000) - timestamp;

        const units = settings.months
            ? UNITS
            : UNITS.filter((u) => u.label !== 'mo').map((u) =>
                  u.label === 'w' ? { ...u, limit: 31449600 } : u,
              );

        let n = '';
        let unit = '';

        for (const u of units) {
            if (diff < u.limit) {
                unit = u.label;
                n = unit === 'now' ? '' : String(Math.floor(diff / u.divisor));
                break;
            }
        }

        if (settings.time === 'short' && SHORT[unit]) unit = SHORT[unit];
        if (settings.time === 'word' && WORD[unit]) unit = WORD[unit];

        if (n && settings.time !== 'letter') {
            unit += n !== '1' ? 's' : '';
        }

        if (n && settings.words) n = toWords(Number(n), settings.spaces);

        if (unit === 'now') return 'now';

        const core = settings.spaces
            ? settings.prefix + ' ' + n + ' ' + unit + ' ' + settings.suffix
            : settings.prefix + n + unit + settings.suffix;

        if (settings.ago) {
            return (core + (settings.spaces ? ' ago' : 'ago')).trim();
        }

        return core.trim();
    }

    function timeAgo(elements, options) {
        const settings = Object.assign(
            {
                time: 'letter',
                spaces: false,
                words: false,
                prefix: '',
                suffix: '',
                ago: false,
                months: true,
            },
            options,
        );

        elements.forEach((el) => {
            const ts = parseInt(el.dataset.timestamp ?? el.textContent, 10);
            if (isNaN(ts)) return;
            el.textContent = format(ts, settings);
        });
    }

    window.timeAgo = timeAgo;
})();

// -------------------- FORMAT NOTES --------------------

document.querySelectorAll('.notecount').forEach((el) => {
    const rawNumber = el.textContent.trim().replace(/,/g, '').match(/\d+/);
    if (!rawNumber) return;

    const count = parseInt(rawNumber[0], 10);
    if (isNaN(count)) return;

    function formatNumber(n) {
        if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}m`;
        if (n >= 1_000) return `${Math.floor(n / 1_000)}k`;
        return n.toString();
    }

    el.textContent = el.classList.contains('has-label')
        ? `${formatNumber(count)}`
        : formatNumber(count);
});

// -------------------- POST CONTROLS --------------------

document.querySelectorAll('.controls__like').forEach((likeBtn) => {
    const likeDiv = likeBtn.querySelector('.like_button');
    if (!likeDiv) return;

    const updateLike = () => {
        const liked = likeDiv.classList.contains('liked');
        likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
        likeBtn.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
        likeBtn.setAttribute('data-tooltip', liked ? 'Unlike post' : 'Like post');
    };

    updateLike();

    const observer = new MutationObserver(updateLike);
    observer.observe(likeDiv, { attributes: true, attributeFilter: ['class'] });
});
