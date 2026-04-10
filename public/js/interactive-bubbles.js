/**
 * Antigravity-style Interactive Bubble Background
 * Features: 3D Depth, Mouse Attraction, and Parallax
 */

class InteractiveBubbles {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null, radius: 150 };
        this.count = 60;
        
        this.init();
        this.animate();
        
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.x;
            this.mouse.y = e.y;
        });
        
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.init();
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.particles = [];
        for (let i = 0; i < this.count; i++) {
            this.particles.push(new Particle(this.canvas.width, this.canvas.height));
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < this.particles.length; i++) {
            this.particles[i].update(this.mouse);
            this.particles[i].draw(this.ctx);
        }
        requestAnimationFrame(() => this.animate());
    }
}

class Particle {
    constructor(w, h) {
        this.width = w;
        this.height = h;
        this.reset();
    }

    reset() {
        this.x = Math.random() * this.width;
        this.y = Math.random() * this.height;
        this.baseX = this.x;
        this.baseY = this.y;
        
        // Depth simulation
        this.z = Math.random() * 10 + 1; // 1 to 11
        this.size = (Math.random() * 15 + 5) * (this.z / 5);
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        
        // Colors from branding
        const colors = [
            'rgba(212, 175, 55, 0.15)', // Gold
            'rgba(58, 134, 255, 0.1)',  // Blue
            'rgba(255, 255, 255, 0.08)' // White
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.blur = (11 - this.z) * 0.5;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        
        // Subtle Gradient for 3D look
        const gradient = ctx.createRadialGradient(
            this.x - this.size * 0.3, 
            this.y - this.size * 0.3, 
            this.size * 0.1, 
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, 'rgba(255,255,255,0.2)');
        gradient.addColorStop(1, this.color);
        
        ctx.fillStyle = gradient;
        if (this.blur > 1) {
            ctx.shadowBlur = this.blur;
            ctx.shadowColor = this.color;
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.stroke();
    }

    update(mouse) {
        // Natural movement
        this.x += this.speedX;
        this.y += this.speedY;

        // Wrap around
        if (this.x < -50) this.x = this.width + 50;
        if (this.x > this.width + 50) this.x = -50;
        if (this.y < -50) this.y = this.height + 50;
        if (this.y > this.height + 50) this.y = -50;

        // Interaction
        if (mouse.x != null) {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < mouse.radius) {
                // "Magnetic" Attraction
                const force = (mouse.radius - distance) / mouse.radius;
                const attraction = force * 2 * (1 / this.z); // Farther bubbles are harder to move
                this.x += (dx / distance) * attraction;
                this.y += (dy / distance) * attraction;
            }
        }
    }
}

// Initialize on background canvas
document.addEventListener('DOMContentLoaded', () => {
    // Create canvas if it doesn't exist
    const bgContainer = document.querySelector('body');
    if (bgContainer) {
        const canvas = document.createElement('canvas');
        canvas.id = 'interactive-bubble-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '-5';
        canvas.style.pointerEvents = 'none';
        bgContainer.prepend(canvas);
        new InteractiveBubbles('interactive-bubble-canvas');
    }
});
