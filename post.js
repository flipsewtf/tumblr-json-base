/*!
 * post.js — lightbox, audio player
 * @mournstera | mournstera.tumblr.com
 */

// -------------------- LIGHTBOX --------------------

(function () {
    let currentImages = [];
    let currentIndex = 0;
    let triggerElement = null;

    // BUILD DOM

    const overlay = document.createElement('div');
    overlay.classList.add('lightbox');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.hidden = true;

    const backdrop = document.createElement('div');
    backdrop.classList.add('lightbox__backdrop');

    const container = document.createElement('div');
    container.classList.add('lightbox__container');

    const closeBtn = document.createElement('button');
    closeBtn.classList.add('lightbox__close');
    closeBtn.setAttribute('aria-label', 'Close lightbox');
    closeBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    const prevBtn = document.createElement('button');
    prevBtn.classList.add('lightbox__prev');
    prevBtn.setAttribute('aria-label', 'Previous image');
    prevBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.classList.add('lightbox__next');
    nextBtn.setAttribute('aria-label', 'Next image');
    nextBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

    const img = document.createElement('img');
    img.classList.add('lightbox__img');
    img.alt = '';

    const caption = document.createElement('p');
    caption.classList.add('lightbox__caption');
    caption.setAttribute('aria-hidden', 'true');

    const announcement = document.createElement('p');
    announcement.classList.add('lightbox__announcement', 'sr-only');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');

    container.appendChild(closeBtn);
    container.appendChild(prevBtn);
    container.appendChild(img);
    container.appendChild(caption);
    container.appendChild(nextBtn);
    container.appendChild(announcement);
    overlay.appendChild(backdrop);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // FOCUS TRAP

    function getFocusableElements() {
        return Array.from(
            container.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
        ).filter((el) => !el.hidden);
    }

    function trapFocus(e) {
        if (e.key !== 'Tab') return;
        const focusable = getFocusableElements();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    // SHOW

    function show(index) {
        const entry = currentImages[index];
        if (!entry) return;
        currentIndex = index;

        img.src = entry.src;
        img.alt = entry.alt || '';
        caption.textContent = entry.alt || '';
        caption.hidden = !entry.alt;

        const isSingle = currentImages.length <= 1;
        prevBtn.hidden = isSingle;
        nextBtn.hidden = isSingle;
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === currentImages.length - 1;

        const label = entry.alt
            ? entry.alt
            : isSingle
              ? 'Image lightbox'
              : 'Image ' + (index + 1) + ' of ' + currentImages.length;
        overlay.setAttribute('aria-label', label);
        announcement.textContent = label;
    }

    // OPEN / CLOSE

    function openLightbox(images, index) {
        currentImages = images;
        triggerElement = document.activeElement;
        show(index);
        overlay.hidden = false;
        document.body.classList.add('lightbox-open');
        document.addEventListener('keydown', handleKeydown);
        closeBtn.focus();
    }

    function closeLightbox() {
        overlay.hidden = true;
        document.body.classList.remove('lightbox-open');
        img.src = '';
        currentImages = [];
        document.removeEventListener('keydown', handleKeydown);
        triggerElement?.focus();
    }

    // EVENTS

    function handleKeydown(e) {
        if (overlay.hidden) return;
        switch (e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                if (currentIndex > 0) show(currentIndex - 1);
                break;
            case 'ArrowRight':
                if (currentIndex < currentImages.length - 1) show(currentIndex + 1);
                break;
            case 'Tab':
                trapFocus(e);
                break;
        }
    }

    backdrop.addEventListener('click', closeLightbox);
    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) show(currentIndex - 1);
    });
    nextBtn.addEventListener('click', () => {
        if (currentIndex < currentImages.length - 1) show(currentIndex + 1);
    });

    // EXPOSE

    window.openLightbox = openLightbox;
})();

// -------------------- AUDIO PLAYER --------------------

document.addEventListener('npf:rendered', () => {
    const playSVG =
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' class='play'><path d='M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'/></svg>";
    const pauseSVG =
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' class='pause'><rect x='14' y='3' width='5' height='18' rx='1'/><rect x='5' y='3' width='5' height='18' rx='1'/></svg>";

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const buildProgressHTML = () => `
        <input type="range" class="audio_native__range" value="0" min="0" max="100" aria-label="Audio progress">
        <div class="audio_native__time">
            <span class="audio_native__current">0:00</span> / <span class="audio_native__duration">0:00</span>
        </div>
    `;

    const bindAudioEvents = (audio, controls, caption) => {
        const playPauseBtn = controls.querySelector('.audio_native__play');
        const progressBar = controls.querySelector('.audio_native__range');
        const currentTimeEl = controls.querySelector('.audio_native__current');
        const durationEl = controls.querySelector('.audio_native__duration');

        const updateProgress = (pct) => {
            progressBar.value = pct;
            progressBar.style.backgroundSize = `${pct}% 100%`;
            progressBar.setAttribute('aria-valuetext', formatTime(audio.currentTime));
            currentTimeEl.textContent = formatTime(audio.currentTime);
        };

        audio.addEventListener('loadedmetadata', () => {
            durationEl.textContent = formatTime(audio.duration);
        });

        audio.addEventListener('timeupdate', () => {
            updateProgress((audio.currentTime / audio.duration) * 100 || 0);
        });

        playPauseBtn.addEventListener('click', () => {
            if (audio.paused) {
                audio.play();
                playPauseBtn.innerHTML = pauseSVG;
                playPauseBtn.setAttribute('aria-label', 'Pause');
                caption.classList.add('is-playing');
            } else {
                audio.pause();
                playPauseBtn.innerHTML = playSVG;
                playPauseBtn.setAttribute('aria-label', 'Play');
                caption.classList.remove('is-playing');
            }
        });

        progressBar.addEventListener('input', (e) => {
            audio.currentTime = (e.target.value / 100) * audio.duration;
            updateProgress(Number(e.target.value));
        });

        audio.addEventListener('ended', () => {
            playPauseBtn.innerHTML = playSVG;
            playPauseBtn.setAttribute('aria-label', 'Play');
            caption.classList.remove('is-playing');
        });
    };

    const setupAudioPlayer = (audio, caption) => {
        if (caption.querySelector('.audio_native__range')) return;

        const controls = document.createElement('div');
        controls.classList.add('audio_native__controls');
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', 'Audio player');

        const playBtn = document.createElement('button');
        playBtn.classList.add('audio_native__play');
        playBtn.setAttribute('aria-label', 'Play');
        playBtn.innerHTML = playSVG;
        controls.appendChild(playBtn);

        const progress = document.createElement('div');
        progress.classList.add('audio_native__progress');
        progress.innerHTML = buildProgressHTML();
        controls.appendChild(progress);

        caption.appendChild(controls);

        const durationEl = caption.querySelector('.audio_native__duration');
        if (!isNaN(audio.duration) && audio.duration > 0) {
            durationEl.textContent = formatTime(audio.duration);
        } else {
            audio.addEventListener(
                'loadedmetadata',
                () => {
                    durationEl.textContent = formatTime(audio.duration);
                },
                { once: true },
            );
            audio.addEventListener(
                'error',
                () => {
                    durationEl.textContent = '—';
                },
                { once: true },
            );
        }

        bindAudioEvents(audio, controls, caption);
        caption.classList.add('is-ready');
    };

    const handleAudioPosts = () => {
        document.querySelectorAll('.audio_native').forEach((caption) => {
            const audio = caption.querySelector('audio');
            if (!audio || audio.dataset.npfHandled) return;

            audio.dataset.npfHandled = 'true';
            audio.style.display = 'none';

            setupAudioPlayer(audio, caption);
        });
    };

    handleAudioPosts();
});
