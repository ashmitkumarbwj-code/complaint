/**
 * Smart Campus Response System
 * GSAP, Chart.js, and Particles.js Initialization
 */

document.addEventListener("DOMContentLoaded", () => {
    // Register GSAP ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    initParticles();
    initGSAPAnimations();
    initChart();
    initCounters();
    initHeroSlider();
});

/* --- Storytelling Background Logic --- */


/* =========================================================================
   1. Particles.js Initialization
   ========================================================================= */
function initParticles() {
    const particleConfig = {
        "particles": {
            "number": { "value": 80, "density": { "enable": true, "value_area": 800 } },
            "color": { "value": ["#d4af37", "#3a86ff", "#ffffff"] },
            "shape": { "type": "circle" },
            "opacity": { "value": 0.5, "random": true, "anim": { "enable": true, "speed": 1, "opacity_min": 0.1, "sync": false } },
            "size": { "value": 3, "random": true, "anim": { "enable": false } },
            "line_linked": { "enable": true, "distance": 150, "color": "#d4af37", "opacity": 0.2, "width": 1 },
            "move": { "enable": true, "speed": 1.5, "direction": "none", "random": true, "straight": false, "out_mode": "out", "bounce": false }
        },
        "interactivity": {
            "detect_on": "canvas",
            "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": true, "mode": "push" }, "resize": true },
            "modes": { "repulse": { "distance": 100, "duration": 0.4 }, "push": { "particles_nb": 4 } }
        },
        "retina_detect": true
    };

    if(document.getElementById('particles-js')) {
        particlesJS("particles-js", particleConfig);
    }
    
    // Slower particles for final CTA
    const ctaConfig = JSON.parse(JSON.stringify(particleConfig));
    ctaConfig.particles.move.speed = 0.5;
    ctaConfig.particles.number.value = 40;
    
    if(document.getElementById('particles-js-cta')) {
        particlesJS("particles-js-cta", ctaConfig);
    }
}

/* =========================================================================
   2. GSAP Scroll Animations
   ========================================================================= */
function initGSAPAnimations() {
    
    // --- Section 1: Welcome Screen ---
    const tl1 = gsap.timeline();
    tl1.to(".gsap-fade-up", {
        y: 0,
        opacity: 1,
        duration: 1,
        stagger: 0.2,
        ease: "power3.out"
    });

    // --- Section 2: The Problem ---
    gsap.to(".section-problem .problem-card", {
        scrollTrigger: {
            trigger: ".section-problem",
            start: "top 60%"
        },
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.2,
        ease: "back.out(1.7)"
    });

    gsap.to(".problem-statement", {
        scrollTrigger: { trigger: ".section-problem", start: "top 40%" },
        opacity: 1,
        duration: 1.5,
        ease: "power2.inOut"
    });

    // --- Section 3: Introducing Solution ---
    const tl3 = gsap.timeline({
        scrollTrigger: { trigger: ".section-solution", start: "top 50%" }
    });

    tl3.to(".interface-illustration", { opacity: 1, y: -20, duration: 1, ease: "power3.out" })
       .to(".sol-step-1", { opacity: 1, duration: 0.5 })
       .to(".connector-1", { opacity: 1, duration: 0.3 })
       .to(".sol-step-2", { opacity: 1, duration: 0.5 })
       .to(".connector-2", { opacity: 1, duration: 0.3 })
       .to(".sol-step-3", { opacity: 1, duration: 0.5 })
       .to(".connector-3", { opacity: 1, duration: 0.3 })
       .to(".sol-step-4", { opacity: 1, scale: 1.05, duration: 0.5, ease: "back.out(1.5)" });

    // --- Section 4: Workflow Animation ---
    const tl4 = gsap.timeline({
        scrollTrigger: { trigger: ".section-workflow", start: "top 50%" }
    });

    // Animate connector line drawing width
    tl4.to(".workflow-line::after", { width: "100%", duration: 2, ease: "power1.inOut" }, 0);
    
    // Pop in nodes successively
    const nodes = document.querySelectorAll(".wf-node");
    nodes.forEach((node, index) => {
        tl4.to(node, {
            scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)",
            onStart: () => node.classList.add('active')
        }, index * 0.4);
    });

    // --- Section 5: Analytics Text & Chart Reveal ---
    const tl5 = gsap.timeline({
        scrollTrigger: { trigger: ".section-analytics", start: "top 60%" }
    });

    tl5.to(".analytics-statement", { opacity: 1, duration: 1, ease: "power2.out" })
       .to(".chart-container", { x: 0, opacity: 1, duration: 1, ease: "power3.out" }, "-=0.5");

    // --- Section 6: Dashboard Mockup ---
    gsap.to(".dashboard-mockup", {
        scrollTrigger: { trigger: ".section-dashboard", start: "top 70%" },
        y: 0, opacity: 1, duration: 1, ease: "power4.out"
    });


    // --- Section 7: Final CTA ---
    const tl7 = gsap.timeline({
        scrollTrigger: { trigger: ".section-cta", start: "top 70%" }
    });
    
    tl7.to(".final-statement", { scale: 1, opacity: 1, duration: 1.2, ease: "power3.out" })
       .to(".cta-buttons", { y: 0, opacity: 1, duration: 0.8 }, "-=0.6");
}

/* =========================================================================
   3. Chart.js Initialization
   ========================================================================= */
function initChart() {
    const ctx = document.getElementById('performanceChart');
    if(!ctx) return;

    // We only execute chart render when scrolled into view
    ScrollTrigger.create({
        trigger: ".section-analytics",
        start: "top 60%",
        once: true,
        onEnter: () => renderChart(ctx)
    });
}

function renderChart(canvas) {
    // Create a loading overlay inside the parent container
    const parent = canvas.parentElement;

    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'chart-loading-overlay';
    loadingOverlay.style.cssText = `
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 1rem; border-radius: 12px;
        background: rgba(11, 19, 43, 0.5);
        z-index: 5;
    `;
    loadingOverlay.innerHTML = `
        <div style="width: 36px; height: 36px; border: 3px solid rgba(212,175,55,0.2); border-top-color: #d4af37; border-radius: 50%; animation: chartSpin 0.9s linear infinite;"></div>
        <p style="color: #adb5bd; font-size: 0.85rem; font-family: Inter, sans-serif;">Loading live data...</p>
        <style>@keyframes chartSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
    `;
    parent.appendChild(loadingOverlay);
    canvas.style.opacity = '0';

    fetch(`${API_BASE}/api/dashboards/public/weekly-stats`)
        .then(res => res.json())
        .then(data => {
            loadingOverlay.remove();

            const hasData = data.success &&
                (data.resolved.some(v => v > 0) || data.unresolved.some(v => v > 0));

            if (!hasData) {
                // Show empty state instead of blank chart
                const emptyEl = document.createElement('div');
                emptyEl.style.cssText = `
                    position: absolute; inset: 0;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    gap: 0.75rem;
                `;
                emptyEl.innerHTML = `
                    <i class="fa-solid fa-chart-bar" style="font-size: 2rem; color: rgba(255,255,255,0.15);"></i>
                    <p style="color: #adb5bd; font-size: 0.9rem; font-family: Inter, sans-serif;">No complaint data yet — check back soon.</p>
                `;
                parent.appendChild(emptyEl);
                return;
            }

            canvas.style.transition = 'opacity 0.6s ease';
            canvas.style.opacity = '1';

            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: data.weeks,
                    datasets: [
                        {
                            label: 'Resolved',
                            data: data.resolved,
                            backgroundColor: '#2ea043',
                            borderRadius: 5
                        },
                        {
                            label: 'Unresolved',
                            data: data.unresolved,
                            backgroundColor: '#f85149',
                            borderRadius: 5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 2000, easing: 'easeOutQuart' },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.08)' },
                            ticks: { color: '#adb5bd' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#adb5bd' }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { color: '#ffffff', font: { family: 'Inter', size: 12 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} complaints`
                            }
                        }
                    }
                }
            });
        })
        .catch(err => {
            console.error('[Chart] Error rendering chart:', err);
            loadingOverlay.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation" style="color: #f85149; font-size: 1.5rem;"></i>
                <p style="color: #adb5bd; font-size: 0.85rem; font-family: Inter, sans-serif;">Chart unavailable. Please refresh.</p>
            `;
        });
}

/* =========================================================================
   4. Counters Animation (Section 6 Dashboard)
   ========================================================================= */
function initCounters() {
    const runCounters = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/dashboards/public/stats`, { credentials: 'include' });
            const data = await res.json();
            
            if (data.success) {
                const total = data.solved + data.unresolved;
                const efficiency = total > 0 ? Math.round((data.solved / total) * 100) : 0;

                gsap.to(".counter-total", { innerHTML: total, duration: 2, snap: { innerHTML: 1 , credentials: 'include' }, ease: "power1.inOut" });
                gsap.to(".counter-resolved", { innerHTML: data.solved, duration: 2.5, snap: { innerHTML: 1 }, ease: "power1.inOut" });
                gsap.to(".counter-efficiency", { innerHTML: efficiency, duration: 2.5, snap: { innerHTML: 1 }, ease: "power1.inOut", onUpdate: function() {
                    document.querySelector('.counter-efficiency').innerHTML += '%';
                }});
                // Alerts count can stays hardcoded or we can fetch true criticals
                gsap.to(".counter-alerts", { innerHTML: 2, duration: 1, snap: { innerHTML: 1 }, ease: "power1.inOut" });
            }
        } catch (err) { console.error('Error fetching public stats:', err); }
    };

    ScrollTrigger.create({
        trigger: ".section-dashboard",
        start: "top 70%",
        once: true,
        onEnter: runCounters
    });
}

/* =========================================================================
   5. Fetch and Render Dynamic Gallery
   ========================================================================= */

function initDynamicGallery() {
    const galleryContainer = document.getElementById('dynamic-gallery');
    const sliderFrame = document.getElementById('slider-frame');
    const sliderTrack = document.getElementById('slider-track');
    const sliderNav = document.getElementById('slider-nav');
    const btnPrev = document.getElementById('slider-prev');
    const btnNext = document.getElementById('slider-next');
    
    if (!galleryContainer || !sliderTrack) return;

    const apiBase = window.API_BASE || '';
    let isPaused = false;
    let currentSlide = 0;
    let slideInterval;

    fetch(`${apiBase}/api/gallery/public`, { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.images && data.images.length > 0) {
                const totalSlides = data.images.length;
                sliderTrack.innerHTML = '';
                sliderNav.innerHTML = '';

                data.images.forEach((img, idx) => {
                    const slide = document.createElement('div');
                    slide.className = `slider-slide ${idx === 0 ? 'active' : ''}`;
                    
                    const captionTitle = img.title && img.title.trim() !== "" 
                                            ? img.title 
                                            : img.filename.split('.')[0].replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                    slide.innerHTML = `
                        <img src="${img.url}" alt="${img.filename}">
                        <div class="slider-caption">
                            <h3>Campus Highlights</h3>
                            <p>${captionTitle}</p>
                        </div>
                    `;
                    sliderTrack.appendChild(slide);

                    const dot = document.createElement('div');
                    dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
                    dot.addEventListener('click', () => {
                        resetInterval();
                        goToSlide(idx);
                    });
                    sliderNav.appendChild(dot);
                });

                function goToSlide(index) {
                    const slides = sliderTrack.querySelectorAll('.slider-slide');
                    const dots = sliderNav.querySelectorAll('.slider-dot');
                    if (!slides[index]) return;
                    
                    slides[currentSlide].classList.remove('active');
                    dots[currentSlide].classList.remove('active');
                    currentSlide = index;
                    slides[currentSlide].classList.add('active');
                    dots[currentSlide].classList.add('active');
                    
                    gsap.fromTo(slides[currentSlide], 
                        { filter: 'blur(10px)', opacity: 0 }, 
                        { filter: 'blur(0)', opacity: 1, duration: 0.8, ease: "power2.out" }
                    );
                }

                function nextSlide() {
                    if (isPaused) return;
                    goToSlide((currentSlide + 1) % totalSlides);
                }

                function prevSlide() {
                    resetInterval();
                    goToSlide((currentSlide - 1 + totalSlides) % totalSlides);
                }

                function resetInterval() {
                    clearInterval(slideInterval);
                    slideInterval = setInterval(nextSlide, 5000);
                }

                slideInterval = setInterval(nextSlide, 5000);
                btnNext.addEventListener('click', () => { resetInterval(); nextSlide(); });
                btnPrev.addEventListener('click', prevSlide);
                
                sliderFrame.addEventListener('mouseenter', () => isPaused = true);
                sliderFrame.addEventListener('mouseleave', () => isPaused = false);

                // Immediate reveal if already in view, or scroll reveal
                gsap.to(galleryContainer, {
                    scrollTrigger: { trigger: galleryContainer, start: "top 85%" },
                    y: 0, opacity: 1, duration: 1.2, ease: "power3.out"
                });
            } else {
                galleryContainer.style.display = 'none';
            }
        })
        .catch(err => {
            console.error('[Gallery] Load failed:', err);
            galleryContainer.style.display = 'none';
        });
}


    // DOMContentLoaded already setup at top, initDynamicGallery added there if needed.
    // However, it appears it is hooked down here, moving it to top or keeping it here is fine.
    // I'll keep the caller:
document.addEventListener("DOMContentLoaded", () => {
    initDynamicGallery();
});

/* =========================================================================
   6. Hero Slider Initialization (Swiper.js)
   ========================================================================= */
async function initHeroSlider() {
    const swiperWrapper = document.getElementById('hero-swiper-wrapper');
    const heroSlider = document.getElementById('hero-slider');
    if (!swiperWrapper || !heroSlider) return;

    // Attach temporary loading skeleton/spinner
    heroSlider.style.display = 'block';
    swiperWrapper.innerHTML = `
        <div style="display: flex; height: 100%; width: 100%; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
            <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--gold); font-size: 3rem;"></i>
        </div>
    `;

    try {
        console.log('[Hero Slider] Fetching active slides...');
        const url = (window.API_BASE || '') + '/api/slides';
        const res = await fetch(url);
        const data = await res.json();

        console.log(`[Hero Slider] Fetch complete. Found ${data.slides ? data.slides.length : 0} slides.`);

        if (data.success && data.slides && data.slides.length > 0) {
            // Render slides with native lazy loading
            swiperWrapper.innerHTML = data.slides.map(slide => `
                <div class="swiper-slide">
                    <img loading="lazy" src="${slide.image_url}" alt="${slide.title}" style="width:100%; height:100%; object-fit:cover; filter: brightness(0.5); position: absolute; top:0; left:0; z-index:0;">
                    <div style="position:absolute; bottom:15%; left:5%; z-index:10; max-width:600px; text-shadow: 0 4px 10px rgba(0,0,0,0.8);">
                        <h2 style="color:var(--gold); font-size:2.5rem; font-weight:800; margin-bottom:10px;">${slide.title}</h2>
                        ${slide.description ? `<p style="color:white; font-size:1.2rem;">${slide.description}</p>` : ''}
                    </div>
                </div>
            `).join('');

            // Initialize Swiper (lazy module removed in v11)
            new Swiper('.swiper', {
                loop: data.slides.length > 1,
                autoplay: data.slides.length > 1 ? {
                    delay: 5000,
                    disableOnInteraction: false,
                } : false,
                pagination: {
                    el: '.hero-pagination',
                    clickable: true,
                },
                navigation: {
                    nextEl: '.hero-nav-next',
                    prevEl: '.hero-nav-prev',
                },
                effect: 'fade',
                fadeEffect: {
                    crossFade: true
                }
            });
            


        } else {
            // Fallback: hide the loading slider entirely
            heroSlider.style.display = 'none';
            console.log('[Hero Slider] No active slides found. Using static fallback background.');
        }
    } catch (err) {
        console.error('[Hero Slider] Failed to load hero slides:', err);
        heroSlider.style.display = 'none'; // Fallback on error
    }
}

