/**
 * Smart Complaint & Response System - Premium UI Enhancements
 * Includes: Advanced Particle System (Antigravity inspired), Hover Effects, and Reveal Animations
 */

class PremiumUI {
    constructor() {
        this.canvas = document.getElementById('hero-canvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: -1000, y: -1000, active: false };
        this.particleCount = window.innerWidth < 768 ? 60 : 150;
        
        this.init();
        this.animate();
        this.handleEvents();
        this.initRevealAnimations();
        this.initParallax();
    }

    init() {
        this.resize();
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 0.5,
                baseX: Math.random() * this.canvas.width,
                baseY: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                accX: 0,
                accY: 0,
                friction: Math.random() * 0.05 + 0.94,
                color: `rgba(212, 175, 55, ${Math.random() * 0.3 + 0.1})`
            });
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    handleEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.init();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.mouse.active = true;
        });

        window.addEventListener('mouseleave', () => {
            this.mouse.active = false;
        });

        // Parallax scroll effect for bg layers
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const layers = document.querySelectorAll('.bg-layer');
            layers.forEach((layer, index) => {
                const speed = (index + 1) * 0.1;
                layer.style.transform = `translateY(${scrolled * speed}px) scale(${1 + (scrolled * 0.0001)})`;
            });

            // Dynamic background switching
            const sections = document.querySelectorAll('section');
            sections.forEach((section, index) => {
                const rect = section.getBoundingClientRect();
                if (rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) {
                    this.switchBGLayer(index % 3 + 1);
                }
            });
        });
    }

    switchBGLayer(id) {
        const layers = document.querySelectorAll('.bg-layer');
        layers.forEach((layer, index) => {
            if (index + 1 === id) {
                layer.style.opacity = '0.15';
            } else {
                layer.style.opacity = '0';
            }
        });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.particles.forEach(p => {
            // Apply mouse interaction
            if (this.mouse.active) {
                const dx = this.mouse.x - p.x;
                const dy = this.mouse.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const forceRadius = 200;

                if (distance < forceRadius) {
                    const force = (forceRadius - distance) / forceRadius;
                    const angle = Math.atan2(dy, dx);
                    
                    // Antigravity repel
                    p.accX -= Math.cos(angle) * force * 0.6;
                    p.accY -= Math.sin(angle) * force * 0.6;
                    
                    // Slight brightening on interaction
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
                } else {
                    this.ctx.shadowBlur = 0;
                }
            }

            // Physics
            p.vx += p.accX;
            p.vy += p.accY;
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.x += p.vx;
            p.y += p.vy;
            
            // Reset acceleration
            p.accX = (Math.random() - 0.5) * 0.01;
            p.accY = (Math.random() - 0.5) * 0.01;

            // Boundary wrap
            if (p.x < -10) p.x = this.canvas.width + 10;
            if (p.x > this.canvas.width + 10) p.x = -10;
            if (p.y < -10) p.y = this.canvas.height + 10;
            if (p.y > this.canvas.height + 10) p.y = -10;

            // Draw
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
        });

        requestAnimationFrame(() => this.animate());
    }

    initRevealAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-visible');
                    // Add staggered children animation if exists
                    const staggered = entry.target.querySelectorAll('.stagger-item');
                    staggered.forEach((item, i) => {
                        setTimeout(() => item.classList.add('reveal-visible'), i * 150);
                    });
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        document.querySelectorAll('.premium-reveal').forEach(el => observer.observe(el));
    }

    initParallax() {
        document.addEventListener('mousemove', (e) => {
            const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
            
            document.querySelectorAll('.parallax-float').forEach(el => {
                const depth = el.dataset.depth || 1;
                el.style.transform = `translate(${moveX * depth}px, ${moveY * depth}px)`;
            });
        });
    }
}

// Stagger Item Reveal Style
const style = document.createElement('style');
style.textContent = `
    .stagger-item {
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .stagger-item.reveal-visible {
        opacity: 1;
        transform: translateY(0);
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    window.premiumUI = new PremiumUI();
});
