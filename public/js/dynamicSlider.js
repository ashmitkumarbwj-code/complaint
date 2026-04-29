/**
 * Dynamic Slider - Homepage Frontend
 * Fetches from /api/dynamic-slides and renders image/video slides
 * PARALLEL system — does NOT touch the existing hero slider
 */
(function () {
    const API_BASE = window.API_BASE || '';
    let dynSlides = [];
    let dynCurrentIndex = 0;
    let dynAutoTimer = null;

    async function initDynamicSlider() {
        try {
            const res = await fetch(`${API_BASE}/api/dynamic-slides`);
            const data = await res.json();

            if (!data.success || !data.slides || data.slides.length === 0) {
                // No slides: keep entire section hidden (zero layout impact)
                return;
            }

            dynSlides = data.slides;

            // Reveal the section header & container
            const header = document.getElementById('dynamic-slider-header');
            const container = document.getElementById('dynamic-slider-container');
            if (header) {
                header.style.display = 'block';
                header.style.opacity = '1';
                header.style.transform = 'none';
            }
            if (container) {
                container.style.display = 'block';
                container.style.opacity = '1';
                container.style.transform = 'none';
            }

            // Show nav arrows if more than one slide
            if (dynSlides.length > 1) {
                const prevBtn = document.getElementById('dyn-prev');
                const nextBtn = document.getElementById('dyn-next');
                if (prevBtn) prevBtn.style.display = 'flex';
                if (nextBtn) nextBtn.style.display = 'flex';
            }

            renderSlides();
            renderDots();
            goToSlide(0);

            // Auto-advance every 5 seconds
            if (dynSlides.length > 1) {
                dynAutoTimer = setInterval(() => {
                    goToSlide((dynCurrentIndex + 1) % dynSlides.length);
                }, 5000);
            }
        } catch (err) {
            console.warn('[DynamicSlider] Could not load dynamic slides:', err);
        }
    }

    function renderSlides() {
        const inner = document.getElementById('dynamic-slides-inner');
        if (!inner) return;

        inner.innerHTML = dynSlides.map((slide, i) => {
            const mediaHtml = slide.media_type === 'video'
                ? `<video
                    src="${slide.media_url}"
                    autoplay muted loop playsinline
                    style="width:100%; height:420px; object-fit:cover; display:block; pointer-events:none;"
                    aria-label="${slide.title}"
                  ></video>`
                : `<img
                    src="${slide.media_url}"
                    alt="${slide.title}"
                    style="width:100%; height:420px; object-fit:cover; display:block;"
                    loading="${i === 0 ? 'eager' : 'lazy'}"
                  >`;

            return `<div class="dyn-slide" data-index="${i}" style="
                min-width: 100%;
                position: relative;
                flex-shrink: 0;
                transition: opacity 0.4s ease;
            ">${mediaHtml}</div>`;
        }).join('');
    }

    function renderDots() {
        const dotsContainer = document.getElementById('dynamic-slider-dots');
        if (!dotsContainer || dynSlides.length <= 1) return;

        dotsContainer.innerHTML = dynSlides.map((_, i) => `
            <button
                onclick="window.dynamicSliderGoto(${i})"
                id="dyn-dot-${i}"
                style="
                    width: 10px; height: 10px; border-radius: 50%; border: none; cursor: pointer;
                    background: ${i === 0 ? 'var(--gold, #d4af37)' : 'rgba(255,255,255,0.3)'};
                    transition: all 0.3s ease; padding: 0;
                "
                aria-label="Go to slide ${i + 1}"
            ></button>
        `).join('');
    }

    function goToSlide(index) {
        if (index < 0 || index >= dynSlides.length) return;
        dynCurrentIndex = index;

        const inner = document.getElementById('dynamic-slides-inner');
        if (inner) {
            inner.style.transform = `translateX(-${index * 100}%)`;
        }

        // Update overlay text
        const slide = dynSlides[index];
        const titleEl = document.getElementById('dynamic-slide-title-display');
        const descEl = document.getElementById('dynamic-slide-desc-display');
        if (titleEl) titleEl.textContent = slide.title || '';
        if (descEl) descEl.textContent = slide.description || '';

        // Update dots
        dynSlides.forEach((_, i) => {
            const dot = document.getElementById(`dyn-dot-${i}`);
            if (dot) {
                dot.style.background = i === index ? 'var(--gold, #d4af37)' : 'rgba(255,255,255,0.3)';
                dot.style.width = i === index ? '28px' : '10px';
                dot.style.borderRadius = i === index ? '5px' : '50%';
            }
        });
    }

    // Exposed globals for button onclick handlers
    window.dynamicSliderPrev = function () {
        if (dynAutoTimer) clearInterval(dynAutoTimer);
        goToSlide((dynCurrentIndex - 1 + dynSlides.length) % dynSlides.length);
    };

    window.dynamicSliderNext = function () {
        if (dynAutoTimer) clearInterval(dynAutoTimer);
        goToSlide((dynCurrentIndex + 1) % dynSlides.length);
    };

    window.dynamicSliderGoto = function (index) {
        if (dynAutoTimer) clearInterval(dynAutoTimer);
        goToSlide(index);
    };

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDynamicSlider);
    } else {
        initDynamicSlider();
    }
})();
