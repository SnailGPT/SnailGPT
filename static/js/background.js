/**
 * SnailGPT - Advanced SceneEngine
 * Implements high-fidelity, interactive environmental backgrounds with 
 * 4-layer parallax, dynamic physics, and 8 unique scene themes.
 */

class SceneEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.particles = [];
        this.layers = 4;
        this.mouse = { x: -1000, y: -1000, active: false, vx: 0, vy: 0 };
        this.lastMouse = { x: 0, y: 0 };
        this.clicks = [];
        this.activeTheme = 'midnight';
        this.transition = { progress: 1, duration: 800, target: 'midnight', start: 'midnight' };
        this.lastTime = 0;

        this.themes = {
            midnight: {
                pColor: [255, 255, 255],
                lColor: [100, 149, 237],
                bg: '#05060b',
                count: 140,
                speed: 0.2,
                connectDist: 120,
                glow: 10,
                physics: 'float'
            },
            crimson: {
                pColor: [255, 69, 58],
                lColor: [255, 99, 71],
                bg: '#0a0505',
                count: 180,
                speed: 0.4,
                connectDist: 100,
                glow: 25,
                physics: 'heat'
            },
            cyber: {
                pColor: [255, 0, 255],
                lColor: [0, 255, 255],
                bg: '#050a0a',
                count: 160,
                speed: 0.5,
                connectDist: 130,
                glow: 15,
                physics: 'electric'
            },
            neon: {
                pColor: [57, 255, 20],
                lColor: [50, 205, 50],
                bg: '#050a05',
                count: 120,
                speed: 0.3,
                connectDist: 110,
                glow: 30,
                physics: 'matrix'
            },
            aurora: {
                pColor: [125, 211, 252],
                lColor: [110, 231, 183],
                bg: '#050608',
                count: 150,
                speed: 0.25,
                connectDist: 140,
                glow: 20,
                physics: 'flow'
            },
            neondream: {
                pColor: [255, 182, 193],
                lColor: [221, 160, 221],
                bg: '#08050a',
                count: 130,
                speed: 0.15,
                connectDist: 150,
                glow: 35,
                physics: 'dream'
            },
            solarflare: {
                pColor: [255, 215, 0],
                lColor: [255, 140, 0],
                bg: '#0a0805',
                count: 190,
                speed: 0.45,
                connectDist: 110,
                glow: 22,
                physics: 'flare'
            },
            deepsea: {
                pColor: [0, 255, 255],
                lColor: [0, 128, 128],
                bg: '#05070a',
                count: 100,
                speed: 0.1,
                connectDist: 180,
                glow: 8,
                physics: 'heavy'
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
        const layer = Math.floor(Math.random() * this.layers);
        const angle = Math.random() * Math.PI * 2;
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: Math.cos(angle) * config.speed * (layer + 1),
            vy: Math.sin(angle) * config.speed * (layer + 1),
            ax: 0,
            ay: 0,
            size: (layer + 1) * 1.2,
            layer: layer,
            opacity: 0.1 + (layer * 0.2),
            pulse: Math.random() * Math.PI,
            life: 1.0
        };
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.vx = e.clientX - this.lastMouse.x;
            this.mouse.vy = e.clientY - this.lastMouse.y;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.lastMouse.x = e.clientX;
            this.lastMouse.y = e.clientY;
            this.mouse.active = true;
        });
        window.addEventListener('mousedown', (e) => {
            this.clicks.push({ x: e.clientX, y: e.clientY, r: 0, opacity: 1 });
            if (this.clicks.length > 5) this.clicks.shift();
        });
        window.addEventListener('mouseleave', () => this.mouse.active = false);

        const observer = new MutationObserver(() => {
            const classList = document.body.className;
            for (const theme in this.themes) {
                if (classList.includes(`theme-${theme}`)) {
                    if (this.activeTheme !== theme) this.setTheme(theme);
                    break;
                }
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    setTheme(theme) {
        this.transition.start = this.activeTheme;
        this.transition.target = theme;
        this.transition.progress = 0;
        this.activeTheme = theme;
    }

    update(dt) {
        if (this.transition.progress < 1) {
            this.transition.progress += dt / this.transition.duration;
            if (this.transition.progress > 1) this.transition.progress = 1;
        }

        const config = this.themes[this.activeTheme];

        // Update Clicks
        this.clicks.forEach(c => {
            c.r += 15;
            c.opacity -= 0.02;
        });
        this.clicks = this.clicks.filter(c => c.opacity > 0);

        this.particles.forEach(p => {
            // Base Physics by Theme
            switch (config.physics) {
                case 'heat': // Upward drift + vibration
                    p.ay = -0.01;
                    p.ax = (Math.random() - 0.5) * 0.05;
                    break;
                case 'matrix': // Vertical rain-like
                    p.vy = Math.abs(p.vy) + 0.05;
                    p.vx = 0;
                    break;
                case 'heavy': // Slow downward
                    p.ay = 0.005;
                    break;
                case 'flow': // Sine wave drift
                    p.ax = Math.sin(p.y / 150 + this.lastTime / 1000) * 0.02;
                    break;
                default:
                    p.ax = p.ay = 0;
            }

            // Mouse Interaction Logic
            if (this.mouse.active) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const limit = 200 + (p.layer * 50);

                if (dist < limit) {
                    const force = (limit - dist) / limit;

                    // Interaction types based on theme
                    if (config.physics === 'electric') { // Strong attraction
                        p.vx -= dx * force * 0.005;
                        p.vy -= dy * force * 0.005;
                    } else if (config.physics === 'flare') { // Explosive repulsion
                        p.vx += (dx / dist) * force * 2;
                        p.vy += (dy / dist) * force * 2;
                    } else { // Standard soft repulsion
                        p.vx += dx * force * 0.0005 * (p.layer + 1);
                        p.vy += dy * force * 0.0005 * (p.layer + 1);
                    }

                    // Mouse velocity influence
                    p.vx += this.mouse.vx * 0.01 * p.layer;
                    p.vy += this.mouse.vy * 0.01 * p.layer;
                }
            }

            // Click Shockwaves
            this.clicks.forEach(c => {
                const dx = p.x - c.x;
                const dy = p.y - c.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (Math.abs(dist - c.r) < 20) {
                    const push = (20 - Math.abs(dist - c.r)) / 20 * 5;
                    p.vx += (dx / dist) * push;
                    p.vy += (dy / dist) * push;
                }
            });

            // Friction & Velocity Clamp
            p.vx *= 0.98;
            p.vy *= 0.98;

            p.x += p.vx;
            p.y += p.vy;

            // Loop wraps
            if (p.x < -50) p.x = this.canvas.width + 50;
            if (p.x > this.canvas.width + 50) p.x = -50;
            if (p.y < -50) p.y = this.canvas.height + 50;
            if (p.y > this.canvas.height + 50) p.y = -50;

            p.pulse += 0.03;
        });
    }

    lerpColor(c1, c2, t) {
        return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
    }

    draw() {
        const tStep = this.transition.progress;
        const cur = this.themes[this.transition.start];
        const tar = this.themes[this.transition.target];
        const config = tStep < 1 ? tar : cur; // Use target for properties, lerp for colors

        this.ctx.fillStyle = tar.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const pCol = this.lerpColor(cur.pColor, tar.pColor, tStep);
        const lCol = this.lerpColor(cur.lColor, tar.lColor, tStep);
        const glow = cur.glow + (tar.glow - cur.glow) * tStep;
        const cDist = cur.connectDist + (tar.connectDist - cur.connectDist) * tStep;

        // Connections
        this.ctx.lineWidth = 0.8;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];
                if (p1.layer !== p2.layer) continue;

                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < cDist) {
                    const opacity = (1 - dist / cDist) * 0.2 * (p1.layer / 3) * tStep;
                    this.ctx.strokeStyle = `rgba(${lCol.join(',')}, ${opacity})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }

        // Click Ripples
        this.clicks.forEach(c => {
            this.ctx.strokeStyle = `rgba(${pCol.join(',')}, ${c.opacity * 0.3})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            this.ctx.stroke();
        });

        // Particles
        this.particles.forEach(p => {
            let opacity = p.opacity * (0.8 + Math.sin(p.pulse) * 0.2);
            this.ctx.fillStyle = `rgba(${pCol.join(',')}, ${opacity})`;

            if (glow > 0) {
                this.ctx.shadowBlur = glow * (p.layer + 1) / 2;
                this.ctx.shadowColor = `rgba(${pCol.join(',')}, ${opacity})`;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.shadowBlur = 0;
    }

    loop(time) {
        const dt = time - this.lastTime;
        this.lastTime = time;
        this.update(dt || 16);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}

window.addEventListener('load', () => {
    window.sceneEngine = new SceneEngine('bg-canvas');
});

export default SceneEngine;
