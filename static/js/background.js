/**
 * SnailGPT - Futuristic Background Engine
 * Implements a high-performance, theme-aware particle & constellation system
 * with layered parallax and smooth transitions between 8 distinct themes.
 */

class BackgroundEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.particles = [];
        this.layers = 3;
        this.mouse = { x: -1000, y: -1000, active: false };
        this.activeTheme = 'midnight';
        this.transitionProgress = 1;
        this.transitionDuration = 500; // ms
        this.lastTime = 0;

        this.themes = {
            midnight: {
                particleColor: '255, 255, 255',
                lineColor: '100, 149, 237',
                speed: 0.15,
                count: 120,
                connectionDist: 100,
                glow: 5,
                drift: 'random'
            },
            crimson: {
                particleColor: '255, 69, 58',
                lineColor: '255, 99, 71',
                speed: 0.3,
                count: 150,
                connectionDist: 90,
                glow: 15,
                pulse: true
            },
            cyber: {
                particleColor: '255, 0, 255',
                lineColor: '0, 255, 255',
                speed: 0.4,
                count: 140,
                connectionDist: 110,
                glow: 12,
                glitch: true
            },
            neon: {
                particleColor: '57, 255, 20',
                lineColor: '50, 205, 50',
                speed: 0.25,
                count: 100,
                connectionDist: 80,
                glow: 20,
                drift: 'linear'
            },
            aurora: {
                particleColor: '125, 211, 252',
                lineColor: '110, 231, 183',
                speed: 0.2,
                count: 130,
                connectionDist: 120,
                glow: 10,
                flow: true
            },
            neondream: {
                particleColor: '255, 182, 193',
                lineColor: '221, 160, 221',
                speed: 0.1,
                count: 110,
                connectionDist: 130,
                glow: 25,
                blur: true
            },
            solarflare: {
                particleColor: '255, 215, 0',
                lineColor: '255, 140, 0',
                speed: 0.35,
                count: 160,
                connectionDist: 95,
                glow: 18,
                radial: true
            },
            deepsea: {
                particleColor: '0, 255, 255',
                lineColor: '0, 128, 128',
                speed: 0.08,
                count: 90,
                connectionDist: 150,
                glow: 4,
                heavy: true
            }
        };

        this.init();
        this.bindEvents();
        requestAnimationFrame((t) => this.loop(t));
    }

    init() {
        this.resize();
        this.createParticles();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticles() {
        this.particles = [];
        const config = this.themes[this.activeTheme];
        for (let i = 0; i < config.count; i++) {
            this.particles.push(this.newParticle(config));
        }
    }

    newParticle(config) {
        const layer = Math.floor(Math.random() * this.layers); // 0: back, 1: mid, 2: fore
        const angle = Math.random() * Math.PI * 2;
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: Math.cos(angle) * config.speed * (layer + 1),
            vy: Math.sin(angle) * config.speed * (layer + 1),
            size: (layer + 1) * 1.5,
            layer: layer,
            opacity: 0.2 + (layer * 0.2),
            pulse: Math.random() * Math.PI
        };
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.mouse.active = true;
        });
        window.addEventListener('mouseleave', () => this.mouse.active = false);

        // Listen for theme changes on body class
        const observer = new MutationObserver(() => {
            const classList = document.body.className;
            for (const theme in this.themes) {
                if (classList.includes(`theme-${theme}`)) {
                    if (this.activeTheme !== theme) {
                        this.setTheme(theme);
                    }
                    break;
                }
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    setTheme(theme) {
        this.activeTheme = theme;
        this.transitionProgress = 0;
        // Optionally re-seed or adapt existing particles
    }

    update(dt) {
        const config = this.themes[this.activeTheme];
        if (this.transitionProgress < 1) {
            this.transitionProgress += dt / this.transitionDuration;
            if (this.transitionProgress > 1) this.transitionProgress = 1;
        }

        this.particles.forEach(p => {
            // Motion logic
            if (config.flow) {
                p.vx += Math.sin(p.y / 100 + this.lastTime / 1000) * 0.01;
            }
            if (config.radial) {
                const dx = p.x - this.canvas.width / 2;
                const dy = p.y - this.canvas.height / 2;
                const dist = Math.sqrt(dx * dx + dy * dy);
                p.vx += (dx / Math.max(1, dist)) * 0.01;
                p.vy += (dy / Math.max(1, dist)) * 0.01;
            }

            p.x += p.vx;
            p.y += p.vy;

            // Theme-Specific Mouse Interaction
            if (this.mouse.active) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const limit = this.activeTheme === 'neon' ? 100 : 250;

                if (dist < limit) {
                    const force = (limit - dist) / limit;

                    switch (this.activeTheme) {
                        case 'midnight':
                            // Very subtle repulsion
                            p.x += dx * force * 0.01 * (p.layer + 0.5);
                            p.y += dy * force * 0.01 * (p.layer + 0.5);
                            break;

                        case 'crimson':
                            // Stronger repulsion with ripple-like speed boost
                            p.x += dx * force * 0.08;
                            p.y += dy * force * 0.08;
                            p.opacity = Math.min(1, p.opacity + 0.1);
                            break;

                        case 'cyber':
                            // Sharp snap-like response (high acceleration)
                            p.vx += (dx / dist) * force * 0.5;
                            p.vy += (dy / dist) * force * 0.5;
                            break;

                        case 'neon':
                            // Precise and tight interaction
                            p.x += dx * force * 0.1;
                            p.y += dy * force * 0.1;
                            break;

                        case 'aurora':
                            // Bend and flow around cursor (vortex-like)
                            p.vx += (dy / dist) * force * 0.2;
                            p.vy -= (dx / dist) * force * 0.2;
                            break;

                        case 'neondream':
                            // Slow drift away with trail
                            p.x += dx * force * 0.02;
                            p.y += dy * force * 0.02;
                            break;

                        case 'solarflare':
                            // Burst/scatter outward
                            const scatter = Math.random() * 2;
                            p.x += dx * force * scatter;
                            p.y += dy * force * scatter;
                            break;

                        case 'deepsea':
                            // Very slow, heavy interaction
                            p.x += dx * force * 0.005;
                            p.y += dy * force * 0.005;
                            break;
                    }
                }
            }

            // Boundary wrap
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            p.pulse += 0.02;
        });
    }

    draw() {
        const config = this.themes[this.activeTheme];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw connections first
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];
                if (p1.layer !== p2.layer) continue; // Only connect same layer

                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < config.connectionDist) {
                    const opacity = (1 - dist / config.connectionDist) * 0.15 * p1.opacity;
                    this.ctx.strokeStyle = `rgba(${config.lineColor}, ${opacity})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }

        // Draw particles
        this.particles.forEach(p => {
            let opacity = p.opacity;
            if (config.pulse) {
                opacity *= 0.6 + Math.sin(p.pulse) * 0.4;
            }

            this.ctx.fillStyle = `rgba(${config.particleColor}, ${opacity})`;
            if (config.glow > 0) {
                this.ctx.shadowBlur = config.glow;
                this.ctx.shadowColor = `rgba(${config.particleColor}, ${opacity})`;
            } else {
                this.ctx.shadowBlur = 0;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Reset shadow
        this.ctx.shadowBlur = 0;
    }

    loop(time) {
        const dt = time - this.lastTime;
        this.lastTime = time;
        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}

// Global initialization
window.addEventListener('load', () => {
    window.backgroundEngine = new BackgroundEngine('bg-canvas');
});

export default BackgroundEngine;
