// Initialization
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Initial Loader Animation
    const tlLoader = gsap.timeline();
    
    tlLoader.to(".logo-loader", {
        opacity: 1,
        y: -10,
        duration: 1,
        ease: "power2.out"
    })
    .to(".logo-loader", {
        opacity: 0,
        y: -20,
        duration: 0.5,
        delay: 0.5,
        ease: "power2.in"
    })
    .to(".loader-overlay", {
        y: "-100%",
        duration: 0.8,
        ease: "power4.inOut",
        onComplete: startHeroAnimation
    });

    // 2. Hero Section Animation
    async function startHeroAnimation() {
        const tlHero = gsap.timeline();
        
        // Navbar
        tlHero.from(".brand", { y: -20, opacity: 0, duration: 0.5, ease: "power2.out" })
              .from(".nav-links a", { y: -20, opacity: 0, duration: 0.5, stagger: 0.1, ease: "power2.out"}, "-=0.3");
              
        // Hero Content
        tlHero.from(".hero-title", { y: 30, opacity: 0, duration: 0.8, ease: "power3.out"}, "-=0.2")
              .from(".hero-subtitle", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out"}, "-=0.6")
              .from(".hero-actions .btn", { y: 20, opacity: 0, duration: 0.5, stagger: 0.2, ease: "back.out(1.5)"}, "-=0.6");
              
        // Hero Visual Card
        tlHero.from(".visual-card", { x: 50, opacity: 0, duration: 1, ease: "power3.out"}, "-=0.8");

        try {
            const res = await fetch('/api/dashboards/public/stats?tenant_id=1');
            const data = await res.json();
            if (data.success) {
                const total = data.solved + data.unresolved;
                gsap.to(document.getElementById("count-total"), { innerHTML: total, duration: 2, snap: { innerHTML: 1 }, ease: "power1.inOut" });
                gsap.to(document.getElementById("count-resolved"), { innerHTML: data.solved, duration: 2.5, snap: { innerHTML: 1 }, ease: "power1.inOut" });
            }
        } catch (err) { console.error(err); }
    }

    // 3. Storytelling Scroll Animations
    gsap.registerPlugin(ScrollTrigger);

    const steps = gsap.utils.toArray('.timeline-step');
    
    steps.forEach((step, i) => {
        const content = step.querySelector('.step-content');
        const icon = step.querySelector('.step-icon');
        
        // Determine starting position based on left/right alignment
        const xOffset = i % 2 === 0 ? 50 : -50; 

        gsap.from(content, {
            scrollTrigger: {
                trigger: step,
                start: "top 80%",
                toggleActions: "play none none reverse"
            },
            x: window.innerWidth > 900 ? xOffset : 50,
            opacity: 0,
            duration: 0.8,
            ease: "power3.out"
        });
        
        gsap.from(icon, {
            scrollTrigger: {
                trigger: step,
                start: "top 80%",
                toggleActions: "play none none reverse"
            },
            scale: 0,
            opacity: 0,
            duration: 0.5,
            delay: 0.2,
            ease: "back.out(2)"
        });
    });

});
