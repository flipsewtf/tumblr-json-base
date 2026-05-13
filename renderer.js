(function () {
    'use strict';

    const LF = String.fromCharCode(10);

    // -------------------- UTILITIES --------------------

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Extracts a 64px avatar URL from a blog's avatar array.
    // Falls back to the last entry if no 64px version exists.
    // Returns null if the blog or its avatar array is missing.
    function getAvatarUrl(blog) {
        if (!blog?.avatar?.length) return null;
        const av64 = blog.avatar.find((a) => a.width === 64);
        return (av64 ?? blog.avatar[blog.avatar.length - 1]).url;
    }

    // Returns the largest media entry that fits under maxWidth,
    // or the closest overshoot if all exceed it. Ignores cropped variants.
    function selectMedia(media, maxWidth) {
        const pool = media.filter((m) => !m.cropped);
        const candidates = pool.length ? pool : media;

        const fitting = candidates.filter((m) => m.width <= maxWidth);
        if (fitting.length) return fitting.reduce((a, b) => (a.width > b.width ? a : b));

        // Nothing fits — return closest overshoot rather than just the smallest
        return candidates.reduce((a, b) => (a.width < b.width ? a : b));
    }

    // -------------------- INLINE FORMATTING --------------------

    // Applies NPF inline formatting ranges to a plain text string.
    // Uses an event-driven boundary approach: collects open/close events at
    // each range boundary, then walks the string jumping between them.
    // Array.from() handles Unicode code points so emoji don't break indices.

    function formatText(text, ranges) {
        if (!ranges?.length) {
            return escapeHTML(text).split(LF).join('<br>');
        }

        const chars = Array.from(text);

        // Build a map of boundary position → { open, close } events
        const events = new Map();
        const touch = (pos) => {
            if (!events.has(pos)) events.set(pos, { open: [], close: [] });
        };

        for (const range of ranges) {
            touch(range.start);
            touch(range.end);
            events.get(range.start).open.push(range);
            events.get(range.end).close.push(range);
        }

        const boundaries = [...events.keys()].sort((a, b) => a - b);

        let out = '';
        let pos = 0;

        for (const boundary of boundaries) {
            // Flush chars before this boundary
            for (; pos < boundary && pos < chars.length; pos++) {
                out += chars[pos] === LF ? '<br>' : escapeHTML(chars[pos]);
            }
            for (const fmt of events.get(boundary).close) out += closingTag(fmt);
            for (const fmt of events.get(boundary).open) out += openingTag(fmt);
        }

        // Flush remaining chars after the last boundary
        for (; pos < chars.length; pos++) {
            out += chars[pos] === LF ? '<br>' : escapeHTML(chars[pos]);
        }

        return out;
    }

    function openingTag(fmt) {
        switch (fmt.type) {
            case 'bold':
                return '<b>';
            case 'italic':
                return '<i>';
            case 'strikethrough':
                return '<s>';
            case 'small':
                return '<small>';
            case 'link':
                return '<a href="' + escapeAttr(fmt.url) + '" target="_blank" rel="noopener">';
            case 'mention':
                return '<a href="' + escapeAttr(fmt.blog.url) + '">';
            case 'color':
                return '<span style="color:' + escapeAttr(fmt.hex) + '">';
            default:
                return '';
        }
    }

    function closingTag(fmt) {
        switch (fmt.type) {
            case 'bold':
                return '</b>';
            case 'italic':
                return '</i>';
            case 'strikethrough':
                return '</s>';
            case 'small':
                return '</small>';
            case 'link':
            case 'mention':
                return '</a>';
            case 'color':
                return '</span>';
            default:
                return '';
        }
    }

    // -------------------- TEXT BLOCK --------------------

    function buildTextNode(block) {
        const subtype = block.subtype || '';
        const tag = textSubtypeTag(subtype);
        const el = document.createElement(tag);

        el.innerHTML = formatText(block.text, block.formatting);

        if (!el.innerHTML.trim()) {
            el.innerHTML = '&nbsp;';
        }

        if (block.indent_level) {
            el.dataset.indent = block.indent_level;
        }

        const classMap = {
            quote: 'post-quote',
            indented: 'post-indented',
            chat: 'post-chat',
            quirky: 'post-quirky',
            heading1: 'post-heading1',
            heading2: 'post-heading2',
            'ordered-list-item': 'post-ol-item',
            'unordered-list-item': 'post-ul-item',
        };

        if (classMap[subtype]) el.classList.add(classMap[subtype]);

        return el;
    }

    function textSubtypeTag(subtype) {
        switch (subtype) {
            case 'heading1':
                return 'h2';
            case 'heading2':
                return 'h3';
            case 'quote':
                return 'blockquote';
            case 'indented':
                return 'blockquote';
            case 'chat':
                return 'p';
            case 'quirky':
                return 'p';
            case 'ordered-list-item':
                return 'li';
            case 'unordered-list-item':
                return 'li';
            default:
                return 'p';
        }
    }

    // -------------------- IMAGE BLOCK --------------------

    function buildImageNode(block) {
        const media = block.media;
        if (!media || !media.length) return null;

        const figure = document.createElement('figure');

        // GIFs have a video transcode array on their media entries.
        // Rendered as <img> with srcset using .gifv URLs.
        const isGif = media.some((m) => m.video && m.video.length);

        if (isGif) {
            const img = document.createElement('img');
            img.alt = block.alt_text && block.alt_text.toLowerCase() !== 'image' ? block.alt_text : '';
            img.loading = 'lazy';

            const srcsetEntries = media
                .filter((m) => !m.cropped && m.url)
                .sort((a, b) => a.width - b.width)
                .map((m) => m.url + ' ' + m.width + 'w');

            if (srcsetEntries.length) {
                img.srcset = srcsetEntries.join(', ');
                img.sizes = '(max-width: 540px) 100vw, 540px';
            }

            const best = selectMedia(media, 1280);
            img.src = best.url;
            img.width = best.width;
            img.height = best.height;

            figure.appendChild(img);

            const original = media.find((m) => m.has_original_dimensions);
            figure.dataset.lightboxSrc = original ? original.url : best.url;
            figure.dataset.lightboxType = 'image';
            if (block.alt_text && block.alt_text.toLowerCase() !== 'image') figure.dataset.lightboxAlt = block.alt_text;
        } else {
            const best = selectMedia(media, 1280);
            if (!best) return null;

            const img = document.createElement('img');
            img.src = best.url;
            img.width = best.width;
            img.height = best.height;
            img.loading = 'lazy';
            img.alt = block.alt_text && block.alt_text.toLowerCase() !== 'image' ? block.alt_text : '';

            figure.appendChild(img);

            const original = media.find((m) => m.has_original_dimensions);
            figure.dataset.lightboxSrc = original ? original.url : best.url;
            figure.dataset.lightboxType = 'image';
            if (block.alt_text && block.alt_text.toLowerCase() !== 'image') figure.dataset.lightboxAlt = block.alt_text;
        }

        if (block.caption) {
            const cap = document.createElement('figcaption');
            cap.textContent = block.caption;
            figure.appendChild(cap);
        }

        if (block.attribution?.type === 'post' && block.attribution?.blog?.name) {
            const credit = document.createElement('figcaption');
            credit.classList.add('photo-attribution');
            const link = document.createElement('a');
            link.href = block.attribution.url || block.attribution.blog.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Originally posted by ' + block.attribution.blog.name;
            credit.appendChild(link);
            figure.appendChild(credit);
        }

        return figure;
    }

    // -------------------- LINK BLOCK --------------------

    function buildLinkNode(block) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('post_block__link');

        const anchor = document.createElement('a');
        anchor.classList.add('link__container');
        anchor.href = block.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';

        // ---- POSTER ----
        const poster = document.createElement('div');
        poster.classList.add('link__poster');

        if (block.poster && block.poster.length) {
            const best = selectMedia(block.poster, 540);
            if (best) {
                poster.style.backgroundImage = 'url(' + best.url + ')';
                wrapper.classList.add('link__has-poster');
            }
        }

        // ---- ARROW (inside poster) ----
        const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrowSvg.setAttribute('viewBox', '0 0 24 24');
        arrowSvg.setAttribute('class', 'link__arrow');
        arrowSvg.setAttribute('aria-hidden', 'true');
        ['M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6', 'm21 3-9 9', 'M15 3h6v6'].forEach((d) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            arrowSvg.appendChild(path);
        });
        poster.appendChild(arrowSvg);

        // ---- TITLE (inside poster) ----
        if (block.title) {
            const titleSpan = document.createElement('span');
            titleSpan.classList.add('link__title');
            titleSpan.textContent = block.title;
            poster.appendChild(titleSpan);
        }

        // ---- HOST CONTAINER (inside poster) ----
        if (block.site_name || block.url) {
            let host = block.site_name;
            if (!host) {
                try {
                    host = new URL(block.url).hostname;
                } catch (e) {
                    host = block.url;
                }
            }

            if (host) {
                const hostContainer = document.createElement('div');
                hostContainer.classList.add('link__host-container');

                const hostSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                hostSvg.setAttribute('viewBox', '0 0 24 24');
                hostSvg.setAttribute('class', 'link__host-icon');
                hostSvg.setAttribute('aria-hidden', 'true');
                [
                    'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0',
                    'M3.6 9h16.8',
                    'M3.6 15h16.8',
                    'M11.5 3a17 17 0 0 0 0 18',
                    'M12.5 3a17 17 0 0 1 0 18',
                ].forEach((d) => {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', d);
                    hostSvg.appendChild(path);
                });

                const hostSpan = document.createElement('span');
                hostSpan.classList.add('link__host');
                hostSpan.setAttribute('aria-label', 'Host: ' + host);
                hostSpan.textContent = host;

                hostContainer.append(hostSvg, hostSpan);
                poster.appendChild(hostContainer);
            }
        }

        anchor.appendChild(poster);

        // ---- BODY ----
        const body = document.createElement('div');
        body.classList.add('link__body');

        if (block.description) {
            const desc = document.createElement('div');
            desc.classList.add('link__description');
            desc.textContent =
                block.description.length > 250 ? block.description.slice(0, 250).trim() + '…' : block.description;
            body.appendChild(desc);
        }

        anchor.appendChild(body);
        wrapper.appendChild(anchor);
        return wrapper;
    }

    // -------------------- AUDIO BLOCK --------------------

    function buildAudioNode(block) {
        const figure = document.createElement('figure');
        figure.classList.add('post_block__audio');

        const isNative = block.provider === 'tumblr' && block.media?.url;

        if (!isNative) {
            if (block.embed_url) {
                const iframe = document.createElement('iframe');
                const src = block.embed_url.replace(/^["']|["']$/g, '');
                iframe.src = src;
                iframe.width = '100%';
                if (block.provider === 'spotify') {
                    iframe.height = '152';
                } else if (block.provider === 'soundcloud') {
                    iframe.height = '152';
                } else {
                    iframe.height = '120';
                }
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('allowtransparency', 'true');
                iframe.setAttribute('allow', 'clipboard-write; encrypted-media; fullscreen; picture-in-picture');
                figure.appendChild(iframe);
            } else if (block.embed_html) {
                figure.innerHTML = block.embed_html;
            } else if (block.url) {
                const a = document.createElement('a');
                a.href = block.url;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = block.title || block.url;
                figure.appendChild(a);
            }
            return figure;
        }

        // Native Tumblr audio: custom player wired by post.js.
        const caption = document.createElement('figcaption');
        caption.classList.add('audio_native');

        const header = document.createElement('div');
        header.classList.add('audio_native__header');

        const disc = document.createElement('div');
        disc.classList.add('audio_native__disc');

        if (block.poster?.length) {
            const best = selectMedia(block.poster, 540);
            if (best) {
                const cover = document.createElement('img');
                cover.classList.add('audio_native__cover');
                cover.src = best.url;
                cover.alt = block.title ? 'Album art for ' + block.title : 'Album art';
                cover.loading = 'lazy';
                disc.appendChild(cover);
            }
        }

        const overlay = document.createElement('div');
        overlay.classList.add('audio_native__overlay');
        const wave = document.createElement('div');
        wave.classList.add('audio_native__wave');
        wave.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 5; i++) wave.appendChild(document.createElement('span'));
        overlay.appendChild(wave);
        disc.appendChild(overlay);
        header.appendChild(disc);

        const details = document.createElement('span');
        details.classList.add('audio_native__details');

        if (block.title) {
            const title = document.createElement('span');
            title.classList.add('audio_native__title');
            title.textContent = block.title;
            details.appendChild(title);
        }
        if (block.artist) {
            const artist = document.createElement('span');
            artist.classList.add('audio_native__artist');
            artist.textContent = block.artist;
            details.appendChild(artist);
        }
        if (block.album) {
            const album = document.createElement('span');
            album.classList.add('audio_native__album');
            album.textContent = block.album;
            details.appendChild(album);
        }

        header.appendChild(details);
        caption.appendChild(header);

        // Hidden <audio> element. post.js picks this up and wires the controls.
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.src = block.media.url;
        caption.appendChild(audio);

        figure.appendChild(caption);
        return figure;
    }

    // -------------------- VIDEO BLOCK --------------------

    function buildVideoNode(block, context) {
        // Instagram videos are hard to make responsive so we render a card with dashboard link instead.
        if (block.provider === 'instagram') {
            const card = document.createElement('div');
            card.classList.add('instagram-card');

            const igLogo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            igLogo.setAttribute('viewBox', '0 0 1000 1000');
            igLogo.setAttribute('class', 'insta');
            igLogo.setAttribute('aria-hidden', 'true');
            const igPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            igPath.setAttribute(
                'd',
                'M295.42,6c-53.2,2.51-89.53,11-121.29,23.48-32.87,12.81-60.73,30-88.45,57.82S40.89,143,28.17,175.92c-12.31,31.83-20.65,68.19-23,121.42S2.3,367.68,2.56,503.46,3.42,656.26,6,709.6c2.54,53.19,11,89.51,23.48,121.28,12.83,32.87,30,60.72,57.83,88.45S143,964.09,176,976.83c31.8,12.29,68.17,20.67,121.39,23s70.35,2.87,206.09,2.61,152.83-.86,206.16-3.39S799.1,988,830.88,975.58c32.87-12.86,60.74-30,88.45-57.84S964.1,862,976.81,829.06c12.32-31.8,20.69-68.17,23-121.35,2.33-53.37,2.88-70.41,2.62-206.17s-.87-152.78-3.4-206.1-11-89.53-23.47-121.32c-12.85-32.87-30-60.7-57.82-88.45S862,40.87,829.07,28.19c-31.82-12.31-68.17-20.7-121.39-23S637.33,2.3,501.54,2.56,348.75,3.4,295.42,6m5.84,903.88c-48.75-2.12-75.22-10.22-92.86-17-23.36-9-40-19.88-57.58-37.29s-28.38-34.11-37.5-57.42c-6.85-17.64-15.1-44.08-17.38-92.83-2.48-52.69-3-68.51-3.29-202s.22-149.29,2.53-202c2.08-48.71,10.23-75.21,17-92.84,9-23.39,19.84-40,37.29-57.57s34.1-28.39,57.43-37.51c17.62-6.88,44.06-15.06,92.79-17.38,52.73-2.5,68.53-3,202-3.29s149.31.21,202.06,2.53c48.71,2.12,75.22,10.19,92.83,17,23.37,9,40,19.81,57.57,37.29s28.4,34.07,37.52,57.45c6.89,17.57,15.07,44,17.37,92.76,2.51,52.73,3.08,68.54,3.32,202s-.23,149.31-2.54,202c-2.13,48.75-10.21,75.23-17,92.89-9,23.35-19.85,40-37.31,57.56s-34.09,28.38-57.43,37.5c-17.6,6.87-44.07,15.07-92.76,17.39-52.73,2.48-68.53,3-202.05,3.29s-149.27-.25-202-2.53m407.6-674.61a60,60,0,1,0,59.88-60.1,60,60,0,0,0-59.88,60.1M245.77,503c.28,141.8,115.44,256.49,257.21,256.22S759.52,643.8,759.25,502,643.79,245.48,502,245.76,245.5,361.22,245.77,503m90.06-.18a166.67,166.67,0,1,1,167,166.34,166.65,166.65,0,0,1-167-166.34',
            );
            igLogo.appendChild(igPath);
            card.appendChild(igLogo);

            if (context && context.blogName && context.postId) {
                const igLink = document.createElement('a');
                igLink.classList.add('instagram-card__link');
                igLink.href = 'https://www.tumblr.com/' + context.blogName + '/' + context.postId;
                igLink.target = '_blank';
                igLink.rel = 'noopener';
                igLink.append('View instagram post in dashboard ');

                const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                arrowSvg.setAttribute('viewBox', '0 0 24 24');
                arrowSvg.setAttribute('class', 'viewdashboard');
                arrowSvg.setAttribute('aria-hidden', 'true');
                ['M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6', 'm21 3-9 9', 'M15 3h6v6'].forEach((d) => {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', d);
                    arrowSvg.appendChild(path);
                });

                igLink.appendChild(arrowSvg);
                card.appendChild(igLink);
            }

            return card;
        }

        const container = document.createElement('div');
        container.classList.add('post_block__video');

        if (block.provider === 'tumblr' && block.media) {
            const video = document.createElement('video');
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            if (block.media.url) video.src = block.media.url;
            if (block.poster && block.poster.length) {
                video.poster = selectMedia(block.poster, 1280).url;
            }
            container.appendChild(video);
        } else if (block.embed_iframe) {
            const iframe = document.createElement('iframe');
            iframe.src = block.embed_iframe.url;
            iframe.width = '100%';
            iframe.removeAttribute('height');
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('allow', 'fullscreen; picture-in-picture');
            container.appendChild(iframe);
        } else if (block.embed_html) {
            container.innerHTML = block.embed_html;
        } else if (block.url) {
            const a = document.createElement('a');
            a.href = block.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = block.url;
            container.appendChild(a);
        }

        return container;
    }

    // -------------------- POLL BLOCK --------------------

    function buildPollNode(block, context) {
        const container = document.createElement('div');
        container.classList.add('post_block__poll');
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'Poll');

        if (block.question) {
            const titleWrap = document.createElement('div');
            titleWrap.classList.add('poll__question-wrap');

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('class', 'poll__chart-pie');
            svg.setAttribute('aria-hidden', 'true');

            [
                'M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a2 2 0 0 1 -2 -2v-7a.9 .9 0 0 0 -1 -.8',
                'M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1v-4.5',
            ].forEach((d) => {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                svg.appendChild(path);
            });

            const question = document.createElement('h2');
            question.classList.add('post-heading1', 'poll__question');
            question.textContent = block.question;

            titleWrap.appendChild(svg);
            titleWrap.appendChild(question);
            container.appendChild(titleWrap);
        }

        if (block.answers?.length) {
            const answersWrap = document.createElement('div');
            answersWrap.classList.add('poll__answers');
            answersWrap.setAttribute('role', 'list');

            block.answers.forEach((answer) => {
                const a = document.createElement('a');
                a.classList.add('poll__choice');
                a.setAttribute('role', 'listitem');
                a.textContent = answer.answer_text;

                if (context?.blogName && context?.postId) {
                    a.href = 'https://www.tumblr.com/' + context.blogName + '/' + context.postId;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.setAttribute('aria-label', 'Vote for: ' + answer.answer_text);
                }

                answersWrap.appendChild(a);
            });

            container.appendChild(answersWrap);
        }

        if (block.timestamp && block.settings?.expire_after) {
            const expiresAt = block.timestamp + block.settings.expire_after;
            const now = Math.floor(Date.now() / 1000);

            const footer = document.createElement('p');
            footer.classList.add('poll__footer');

            if (now >= expiresAt) {
                if (context?.blogName && context?.postId) {
                    const results = document.createElement('a');
                    results.classList.add('poll__results');
                    results.href = 'https://www.tumblr.com/' + context.blogName + '/' + context.postId;
                    results.target = '_blank';
                    results.rel = 'noopener';
                    results.textContent = 'See results';
                    footer.appendChild(results);
                }
            } else {
                const remaining = expiresAt - now;
                const days = Math.floor(remaining / 86400);
                const hours = Math.floor((remaining % 86400) / 3600);
                const minutes = Math.floor((remaining % 3600) / 60);

                let timeLeft;
                if (days > 0) timeLeft = days + ' ' + (days === 1 ? 'day' : 'days') + ' remaining';
                else if (hours > 0) timeLeft = hours + ' ' + (hours === 1 ? 'hour' : 'hours') + ' remaining';
                else timeLeft = minutes + ' ' + (minutes === 1 ? 'minute' : 'minutes') + ' remaining';

                const time = document.createElement('span');
                time.classList.add('poll__time-left');
                time.textContent = timeLeft;
                footer.appendChild(time);
            }

            container.appendChild(footer);
        }

        return container;
    }

    // -------------------- NODE BUILDER REGISTRY --------------------

    const nodeBuilders = {
        text: buildTextNode,
        image: buildImageNode,
        link: buildLinkNode,
        audio: buildAudioNode,
        video: buildVideoNode,
        poll: buildPollNode,
    };

    function buildNode(block, context) {
        const builder = nodeBuilders[block.type];
        if (!builder) {
            console.warn('render.js: unknown block type:', block.type, block);
            return null;
        }
        return builder(block, context);
    }

    // -------------------- LAYOUT ENGINE --------------------

    // Parses blocks + layout into a flat ordered item list, respecting
    // the rows layout display order and flagging unplaced blocks.
    function resolveLayout(blocks, layout) {
        const rendered = blocks.map((block, i) => ({ block, el: null, index: i }));

        // Pre-build elements — kept separate from layout resolution
        // so resolveLayout stays pure (index/flag logic only).
        // Elements are attached back by reference before groupItems() runs.

        let rowsLayout = null;
        let truncateAfter = -1;

        if (layout) {
            const rowsEntry = layout.find((l) => l.type === 'rows');
            if (rowsEntry) {
                rowsLayout = rowsEntry;
                if (typeof rowsEntry.truncate_after === 'number') {
                    truncateAfter = rowsEntry.truncate_after;
                }
            }
        }

        const items = [];
        let truncateAt = -1;
        const placed = new Set();

        if (rowsLayout?.display) {
            rowsLayout.display.forEach((row) => {
                if (!row.blocks?.length) return;

                if (truncateAfter >= 0 && truncateAt === -1 && row.blocks[0] > truncateAfter) {
                    truncateAt = items.length;
                }

                row.blocks.forEach((idx) => {
                    placed.add(idx);
                    const block = blocks[idx];
                    if (!block) return;
                    const sub = block.subtype || '';
                    items.push({
                        index: idx,
                        block,
                        isImage: block.type === 'image',
                        isExplicit: block.type === 'image' && row.blocks.length > 1,
                        rowColumns: block.type === 'image' ? row.blocks.length : 0,
                        isList: sub === 'unordered-list-item' || sub === 'ordered-list-item',
                        listType: sub === 'ordered-list-item' ? 'ol' : sub === 'unordered-list-item' ? 'ul' : null,
                        isChat: sub === 'chat',
                    });
                });
            });

            // Append any blocks not referenced in the layout
            blocks.forEach((block, i) => {
                if (placed.has(i)) return;
                const sub = block.subtype || '';
                items.push({
                    index: i,
                    block,
                    isImage: block.type === 'image',
                    isExplicit: false,
                    rowColumns: block.type === 'image' ? 1 : 0,
                    isList: sub === 'unordered-list-item' || sub === 'ordered-list-item',
                    listType: sub === 'ordered-list-item' ? 'ol' : sub === 'unordered-list-item' ? 'ul' : null,
                    isChat: sub === 'chat',
                });
            });
        } else {
            blocks.forEach((block, i) => {
                const sub = block.subtype || '';
                items.push({
                    index: i,
                    block,
                    isImage: block.type === 'image',
                    isExplicit: false,
                    rowColumns: block.type === 'image' ? 1 : 0,
                    isList: sub === 'unordered-list-item' || sub === 'ordered-list-item',
                    listType: sub === 'ordered-list-item' ? 'ol' : sub === 'unordered-list-item' ? 'ul' : null,
                    isChat: sub === 'chat',
                });
            });
        }

        return { items, truncateAt };
    }

    // Groups a flat item list into typed segments:
    // 'photoset' | 'list' | 'single', each carrying their item(s).
    function groupItems(items) {
        const segments = [];
        let i = 0;

        while (i < items.length) {
            const item = items[i];

            if (item.isImage) {
                const run = [];
                while (i < items.length && items[i].isImage) {
                    run.push(items[i++]);
                }
                segments.push({ type: 'photoset', items: run });
            } else if (item.isList) {
                const listType = item.listType;
                const run = [];
                while (i < items.length && items[i].listType === listType) {
                    run.push(items[i++]);
                }
                segments.push({ type: 'list', listType, items: run });
            } else if (item.isChat) {
                const run = [];
                while (i < items.length && items[i].isChat) {
                    run.push(items[i++]);
                }
                segments.push({ type: 'chat', items: run });
            } else {
                segments.push({ type: 'single', items: [item] });
                i++;
            }
        }

        return segments;
    }

    // Euclid's GCD — used to compute LCM for photoset grid columns.
    function gcd(a, b) {
        while (b) {
            const t = b;
            b = a % b;
            a = t;
        }
        return a;
    }

    // Groups consecutive image items into a CSS grid photoset.
    // Uses LCM of all rowColumns values so mixed rows (e.g. 1+2, 2+3) align correctly.
    function createPhotoset(target, imageItems) {
        const photoset = document.createElement('div');
        photoset.classList.add('post_block__photo', 'post_block__photoset');

        let gridCols = 1;
        for (const item of imageItems) {
            const rc = item.rowColumns || 1;
            gridCols = (gridCols * rc) / gcd(gridCols, rc);
        }

        photoset.style.gridTemplateColumns = 'repeat(' + gridCols + ', 1fr)';

        const lbImages = [];

        for (const item of imageItems) {
            const fig = item.el;
            const span = gridCols / (item.rowColumns || 1);
            fig.style.gridColumn = 'span ' + span;
            photoset.appendChild(fig);
            fig.classList.add('photoset__image');

            lbImages.push({
                src: fig.dataset.lightboxSrc || '',
                type: fig.dataset.lightboxType || 'image',
                poster: fig.dataset.lightboxPoster || '',
                alt: fig.dataset.lightboxAlt || '',
            });
        }

        // openLightbox is defined in post.js; load order is guaranteed by the template.
        const figures = photoset.querySelectorAll('figure');
        figures.forEach((fig, idx) => {
            fig.addEventListener('click', () => openLightbox(lbImages, idx));
        });

        if (imageItems.length > 1) {
            photoset.setAttribute('role', 'group');
            photoset.setAttribute('aria-label', 'Photoset');
        }

        target.appendChild(photoset);
    }

    // Mounts grouped segments into a target node.
    // Handles inline images (under 350px natural width) unless explicitly
    // placed in a multi-image row by the layout.
    function mountSegments(target, segments) {
        for (const seg of segments) {
            if (seg.type === 'photoset') {
                // Split out small inline images from the photoset run
                const run = [];
                for (const item of seg.items) {
                    const img = item.el.querySelector('img');
                    const naturalWidth = parseInt(img.getAttribute('width'), 10);
                    if (!item.isExplicit && naturalWidth < 350) {
                        if (run.length) {
                            createPhotoset(target, run);
                            run.length = 0;
                        }
                        item.el.classList.add('post_block__photo', 'post_block__inline_image');
                        const inlineImg = item.el.querySelector('img');
                        if (inlineImg?.sizes) inlineImg.sizes = naturalWidth + 'px';
                        target.appendChild(item.el);
                    } else {
                        run.push(item);
                    }
                }
                if (run.length) createPhotoset(target, run);
            } else if (seg.type === 'list') {
                const list = document.createElement(seg.listType);
                list.classList.add(seg.listType === 'ul' ? 'post-ul' : 'post-ol');
                for (const item of seg.items) list.appendChild(item.el);
                target.appendChild(list);
            } else if (seg.type === 'chat') {
                for (const item of seg.items) target.appendChild(item.el);
            } else {
                target.appendChild(seg.items[0].el);
            }
        }
    }

    // Orchestrates resolveLayout → buildNode → groupItems → mountSegments.
    // Handles truncate_after by inserting a "Keep reading" button between
    // the visible and hidden segments.
    function assembleContent(blocks, layout, context) {
        const frag = document.createDocumentFragment();
        if (!blocks?.length) return frag;

        const { items, truncateAt } = resolveLayout(blocks, layout);

        // Attach rendered elements to each item
        for (const item of items) {
            item.el = buildNode(item.block, context);
        }

        // Drop items whose block type produced no element
        const validItems = items.filter((item) => item.el !== null);

        if (truncateAt > 0 && truncateAt < validItems.length) {
            const visible = validItems.slice(0, truncateAt);
            const hidden = validItems.slice(truncateAt);

            mountSegments(frag, groupItems(visible));

            const btn = document.createElement('button');
            btn.classList.add('read-more');
            btn.setAttribute('aria-expanded', 'false');

            const btnText = document.createTextNode('Keep reading');
            const btnSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            btnSvg.setAttribute('viewBox', '0 0 24 24');
            btnSvg.setAttribute('aria-hidden', 'true');
            btnSvg.classList.add('readmore');
            const btnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            btnPath.setAttribute('d', 'm6 9 6 6 6-6');
            btnSvg.appendChild(btnPath);
            btn.appendChild(btnText);
            btn.appendChild(btnSvg);

            btn.addEventListener('click', () => {
                const f = document.createDocumentFragment();
                mountSegments(f, groupItems(hidden));
                btn.parentNode.insertBefore(f, btn);
                btn.remove();
            });

            frag.appendChild(btn);
        } else {
            mountSegments(frag, groupItems(validItems));
        }

        return frag;
    }

    // -------------------- USER HEADER --------------------

    function createUserHeader(name, url, avatarUrl, active, isTrail = false) {
        const header = document.createElement('div');
        header.classList.add('user-header');
        if (isTrail) header.classList.add('user-header__trail');

        const isDeactivated = active === false;
        const isBroken = active === 'broken';

        let displayName = name || 'unknown';
        if (isDeactivated) {
            const idx = displayName.indexOf('-deactivated');
            if (idx > 0) displayName = displayName.slice(0, idx);
        }

        const avatarWrap = document.createElement('div');
        avatarWrap.classList.add('user-header__avatar');
        avatarWrap.setAttribute('aria-hidden', 'true');

        const img = document.createElement('img');
        img.src =
            avatarUrl ||
            (name && !isBroken
                ? 'https://api.tumblr.com/v2/blog/' + name + '/avatar/64'
                : 'https://assets.tumblr.com/pop/src/assets/images/avatar/anonymous_avatar_96-223fabe0.png');
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () {
            this.src = 'https://assets.tumblr.com/pop/src/assets/images/avatar/anonymous_avatar_96-223fabe0.png';
        };
        avatarWrap.appendChild(img);

        const username =
            isDeactivated || isBroken || !url ? document.createElement('span') : document.createElement('a');

        if (!isDeactivated && !isBroken && url) {
            username.href = url;
            username.target = '_blank';
            username.rel = 'noopener';
        }

        if (isDeactivated) {
            username.setAttribute('data-tooltip', 'Deactivated');
            username.setAttribute('aria-label', displayName + ' - deactivated');
        }
        if (isBroken) {
            username.setAttribute('data-tooltip', 'Blog unavailable');
            username.setAttribute('aria-label', displayName + ' - blog unavailable');
        }

        username.classList.add('user-header__name');
        if (isDeactivated || isBroken) username.classList.add('deactivated');
        username.textContent = displayName;

        header.appendChild(avatarWrap);
        header.appendChild(username);

        return header;
    }

    // -------------------- ASK SECTION --------------------

    function buildAskThread(content, askLayout, askerFallback, answerer, context, isTrail = false, fullLayout = []) {
        const frag = document.createDocumentFragment();

        const askIndices = new Set(askLayout.blocks);

        const askContent = [];
        const answerContent = [];
        const originalToAnswerIndex = new Map();

        content.forEach((block, i) => {
            if (askIndices.has(i)) {
                askContent.push(block);
            } else {
                originalToAnswerIndex.set(i, answerContent.length);
                answerContent.push(block);
            }
        });

        // Remap rows layout indices from original content positions to answerContent
        // positions, dropping ask-only blocks so photosets render correctly.
        const answerLayout = [];
        fullLayout.forEach((l) => {
            if (l.type !== 'rows') return;
            const remappedRows = l.display
                .map((row) => {
                    const remapped = row.blocks
                        .filter((idx) => !askIndices.has(idx))
                        .map((idx) => originalToAnswerIndex.get(idx));
                    return remapped.length ? { blocks: remapped } : null;
                })
                .filter(Boolean);
            if (remappedRows.length) {
                answerLayout.push({ type: 'rows', display: remappedRows });
            }
        });

        let askerName = askLayout.attribution?.blog?.name ?? askerFallback?.name ?? null;
        let askerUrl = askLayout.attribution?.blog?.url ?? askerFallback?.url ?? null;
        let askerAvatar = askLayout.attribution?.blog
            ? getAvatarUrl(askLayout.attribution.blog)
            : (askerFallback?.avatar ?? null);
        let askerActive = askLayout.attribution?.blog?.active ?? undefined;

        let askerDisplay = askerName || 'anonymous';
        if (askerActive === false) {
            const idx = askerDisplay.indexOf('-deactivated');
            if (idx > 0) askerDisplay = askerDisplay.slice(0, idx);
        }

        // ---- ASK BLOCK ----
        const askBlock = document.createElement('div');
        askBlock.classList.add('ask__container');

        const askHeader = document.createElement('header');
        askHeader.classList.add('ask__header');

        const askAvatarImg = document.createElement('img');
        askAvatarImg.classList.add('ask__avatar');
        askAvatarImg.src =
            askerAvatar ||
            (askerName
                ? 'https://api.tumblr.com/v2/blog/' + askerName + '/avatar/48'
                : 'https://assets.tumblr.com/pop/src/assets/images/avatar/anonymous_avatar_96-223fabe0.png');
        askAvatarImg.onerror = function () {
            this.src = 'https://assets.tumblr.com/pop/src/assets/images/avatar/anonymous_avatar_96-223fabe0.png';
        };
        askAvatarImg.alt = '';
        askAvatarImg.loading = 'lazy';

        const askMeta = document.createElement('div');
        askMeta.classList.add('ask__meta');

        const askUsername =
            askerUrl && askerActive !== false ? document.createElement('a') : document.createElement('span');
        askUsername.classList.add('ask__username');
        askUsername.textContent = askerDisplay;
        if (askerUrl && askerActive !== false) {
            askUsername.href = askerUrl;
            askUsername.target = '_blank';
            askUsername.rel = 'noopener';
        }
        if (askerActive === false) {
            askUsername.classList.add('deactivated');
            askUsername.setAttribute('data-tooltip', 'Deactivated');
            askUsername.setAttribute('aria-label', askerDisplay + ' - deactivated');
        }

        const askLabel = document.createElement('span');
        askLabel.classList.add('ask-label');
        askLabel.textContent = 'sent a message';

        askMeta.appendChild(askUsername);
        askMeta.appendChild(askLabel);
        askHeader.appendChild(askAvatarImg);
        askHeader.appendChild(askMeta);

        const askBody = document.createElement('div');
        askBody.classList.add('post_block__ask');
        askBody.appendChild(assembleContent(askContent, [], context));

        askBlock.appendChild(askHeader);
        askBlock.appendChild(askBody);
        frag.appendChild(askBlock);

        // ---- ANSWER BLOCK ----
        if (answerContent.length) {
            if (isTrail && answerer) {
                const answerBlock = document.createElement('div');
                answerBlock.classList.add('ask__container');

                const answerHeader = document.createElement('header');
                answerHeader.classList.add('ask__header');

                const answerAvatarImg = document.createElement('img');
                answerAvatarImg.classList.add('ask__avatar');
                answerAvatarImg.src =
                    answerer.avatar || 'https://api.tumblr.com/v2/blog/' + answerer.name + '/avatar/48';
                answerAvatarImg.onerror = function () {
                    this.src =
                        'https://assets.tumblr.com/pop/src/assets/images/avatar/anonymous_avatar_96-223fabe0.png';
                };
                answerAvatarImg.alt = '';
                answerAvatarImg.loading = 'lazy';

                const answerMeta = document.createElement('div');

                const answerUsername =
                    answerer.url && answerer.active !== false
                        ? document.createElement('a')
                        : document.createElement('span');
                answerUsername.classList.add('ask__username');
                let answererDisplay = answerer.name || 'unknown';
                if (answerer.active === false) {
                    const idx = answererDisplay.indexOf('-deactivated');
                    if (idx > 0) answererDisplay = answererDisplay.slice(0, idx);
                }
                answerUsername.textContent = answererDisplay;
                if (answerer.url && answerer.active !== false) {
                    answerUsername.href = answerer.url;
                    answerUsername.target = '_blank';
                    answerUsername.rel = 'noopener';
                }
                if (answerer.active === false) {
                    answerUsername.classList.add('deactivated');
                    answerUsername.setAttribute('data-tooltip', 'Deactivated');
                    answerUsername.setAttribute('aria-label', answererDisplay + ' - deactivated');
                }

                const answerLabel = document.createElement('span');
                answerLabel.classList.add('ask-label');
                answerLabel.textContent = 'answered';

                answerMeta.appendChild(answerUsername);
                answerMeta.appendChild(answerLabel);
                answerHeader.appendChild(answerAvatarImg);
                answerHeader.appendChild(answerMeta);

                const answerBody = document.createElement('div');
                answerBody.classList.add('post_block__ask');
                answerBody.appendChild(assembleContent(answerContent, answerLayout, context));

                answerBlock.appendChild(answerHeader);
                answerBlock.appendChild(answerBody);
                frag.appendChild(answerBlock);
            } else {
                const answerBody = document.createElement('div');
                answerBody.classList.add('post_block__ask', 'is_original-answer');
                answerBody.appendChild(assembleContent(answerContent, answerLayout, context));
                frag.appendChild(answerBody);
            }
        }

        return frag;
    }

    // -------------------- THREAD RENDERER --------------------
    // Walks the reblog trail and renders each entry.
    // Index 0 = reblog root; its user header is rendered outside
    // section.post-content by bootstrap(), so we skip it here.

    function buildThread(trail, blogInfo) {
        if (!trail?.length) return null;

        const frag = document.createDocumentFragment();

        trail.forEach((entry, i) => {
            const ctx = {
                blogName: entry.blog?.name,
                postId: entry.post?.id ?? null,
            };

            const avatarUrl =
                getAvatarUrl(entry.blog) ?? (blogInfo?.name === entry.blog?.name ? blogInfo.avatar : null);

            const askLayout = entry.layout?.find((l) => l.type === 'ask') ?? null;

            if (askLayout) {
                const answerer = {
                    name: entry.blog?.name,
                    url: entry.blog?.url,
                    avatar: avatarUrl,
                    active: entry.blog?.active,
                };
                frag.appendChild(buildAskThread(entry.content, askLayout, null, answerer, ctx, true, entry.layout));
            } else {
                if (i > 0) {
                    const isBroken = !entry.blog && entry.broken_blog_name != null;
                    const name = isBroken ? entry.broken_blog_name : entry.blog?.name;
                    const url = isBroken
                        ? null
                        : entry.blog?.url && entry.post?.id
                          ? entry.blog.url.replace(/\/$/, '') + '/post/' + entry.post.id
                          : entry.blog?.url;
                    const active = isBroken ? 'broken' : entry.blog?.active;
                    frag.appendChild(createUserHeader(name, url, avatarUrl, active, true));
                }

                const body = document.createElement('div');
                body.classList.add('post_body');
                if (i === 0) body.classList.add('is_root');
                else body.classList.add('is_trail');

                body.appendChild(assembleContent(entry.content, entry.layout, ctx));
                frag.appendChild(body);
            }
        });

        return frag;
    }

    // -------------------- BOOTSTRAP --------------------
    // Finds each article, populates .user-header and section.post-content
    // from the NPF data embedded in .npf_data by the Tumblr template.

    function bootstrap() {
        const html = document.documentElement;

        if (html.classList.contains('ask_page') || html.classList.contains('submit_page')) return;

        const articles = document.querySelectorAll('article');
        articles.forEach((article) => {
            const dataEl = article.querySelector('.npf_data');
            if (!dataEl) return;

            let npf;
            try {
                npf = JSON.parse(dataEl.textContent);
            } catch (e) {
                console.warn('render.js: failed to parse NPF for', article.id, e);
                return;
            }

            const postId = article.id.replace('post-', '');
            const blogName = window.blogName || '';
            const blogUrl = article.dataset.blogUrl || '';
            const avatar = article.dataset.blogAvatar || '';

            const userHeaderEl = article.querySelector('.user-header');
            const section = article.querySelector('.post-content');
            if (!section) return;

            const ctx = { blogName, postId };
            const blogInfo = { name: blogName, url: blogUrl, avatar };

            if (userHeaderEl) {
                const isReblog = npf.trail && npf.trail.length;
                const rootEntry = isReblog ? npf.trail[0] : null;
                const isBrokenRoot = isReblog && !rootEntry.blog && rootEntry.broken_blog_name != null;

                const name = isBrokenRoot
                    ? rootEntry.broken_blog_name || 'unknown'
                    : isReblog && rootEntry.blog
                      ? rootEntry.blog.name
                      : blogName;
                const av = isBrokenRoot ? null : isReblog && rootEntry.blog ? getAvatarUrl(rootEntry.blog) : avatar;
                const active = isBrokenRoot ? 'broken' : isReblog && rootEntry.blog ? rootEntry.blog.active : undefined;
                const url = isBrokenRoot
                    ? null
                    : isReblog && rootEntry.blog && rootEntry.post && rootEntry.post.id
                      ? rootEntry.blog.url + 'post/' + rootEntry.post.id
                      : blogUrl;

                const built = createUserHeader(name, url, av, active, false);
                while (built.firstChild) userHeaderEl.appendChild(built.firstChild);
            }

            const hasTrail = npf.trail && npf.trail.length;
            const hasContent = npf.content && npf.content.length;
            const askLayout = npf.layout ? npf.layout.find((l) => l.type === 'ask') : null;

            if (hasTrail) {
                const thread = buildThread(npf.trail, blogInfo);
                if (thread) section.appendChild(thread);
            }

            if (hasContent) {
                if (askLayout) {
                    section.appendChild(buildAskThread(npf.content, askLayout, null, blogInfo, ctx, false, npf.layout));
                } else if (hasTrail) {
                    section.appendChild(
                        createUserHeader(blogName, blogUrl + 'post/' + postId, avatar, undefined, true),
                    );
                    const body = document.createElement('div');
                    body.classList.add('post_body', 'is_trail');
                    body.appendChild(assembleContent(npf.content, npf.layout, ctx));
                    section.appendChild(body);
                } else {
                    const body = document.createElement('div');
                    body.classList.add('post_body');
                    body.appendChild(assembleContent(npf.content, npf.layout, ctx));
                    section.appendChild(body);
                }
            }

            if (typeof window.bindTooltipNode === 'function') {
                window.bindTooltipNode(article);
            }
        });

        document.dispatchEvent(new CustomEvent('npf:rendered'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
