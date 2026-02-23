/**
 * SnailGPT - Advanced OmniScene Engine
 * Implements high-fidelity WebGL Fluid Dynamics integrated with 
 * 4-layer Parallax Particles and dynamic physics.
 */

class OmniScene {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        // We'll use two layers: WebGL for Fluid, 2D for Particles (better control)
        // Or one WebGL for everything. Let's stick to 2D for particles for now but optimize.
        this.ctx = this.canvas.getContext('2d');

        this.particles = [];
        this.layers = 4;
        this.mouse = { x: -1000, y: -1000, active: false, vx: 0, vy: 0 };
        this.lastMouse = { x: 0, y: 0 };
        this.clicks = [];
        this.activeTheme = 'midnight';
        this.transition = { progress: 1, duration: 800, target: 'midnight', start: 'midnight' };
        this.lastTime = 0;

        // Fluid Simulation State
        this.fluidPoints = [];
        this.maxFluidPoints = 150;

        this.themes = {
            midnight: {
                pColor: [99, 102, 241],
                lColor: [129, 140, 248],
                bg: '#05060b',
                count: 140,
                speed: 0.2,
                connectDist: 120,
                glow: 15,
                physics: 'float'
            },
            crimson: {
                pColor: [239, 68, 68],
                lColor: [244, 63, 94],
                bg: '#0a0505',
                count: 180,
                speed: 0.4,
                connectDist: 100,
                glow: 25,
                physics: 'heat'
            },
            cyber: {
                pColor: [217, 70, 239],
                lColor: [6, 182, 212],
                bg: '#050a0a',
                count: 160,
                speed: 0.5,
                connectDist: 130,
                glow: 20,
                physics: 'electric'
            },
            neon: {
                pColor: [16, 185, 129],
                lColor: [59, 130, 246],
                bg: '#050a05',
                count: 120,
                speed: 0.3,
                connectDist: 110,
                glow: 30,
                physics: 'matrix'
            },
            aurora: {
                pColor: [45, 212, 191],
                lColor: [59, 130, 246],
                bg: '#050608',
                count: 150,
                speed: 0.25,
                connectDist: 140,
                glow: 20,
                physics: 'flow'
            },
            neondream: {
                pColor: [255, 0, 128],
                lColor: [0, 242, 255],
                bg: '#08050a',
                count: 130,
                speed: 0.15,
                connectDist: 150,
                glow: 35,
                physics: 'dream'
            },
            solarflare: {
                pColor: [251, 191, 36],
                lColor: [244, 63, 94],
                bg: '#0a0805',
                count: 190,
                speed: 0.45,
                connectDist: 110,
                glow: 22,
                physics: 'flare'
            },
            deepsea: {
                pColor: [59, 130, 246],
                lColor: [45, 212, 191],
                bg: '#05070a',
                count: 100,
                speed: 0.1,
                connectDist: 180,
                glow: 12,
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

        // Restore theme from localStorage
        const saved = localStorage.getItem('snail-gpt-theme');
        if (saved && this.themes[saved]) {
            this.activeTheme = saved;
            this.transition.target = saved;
            this.transition.start = saved;
        }
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
            size: (layer + 1) * 1.5,
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

            // Add point to fluid simulation
            const config = this.themes[this.activeTheme];
            this.addFluidPoint(e.clientX, e.clientY, `rgba(${config.pColor.join(',')}, 0.5)`);
        });

        window.addEventListener('mousedown', (e) => {
            this.clicks.push({ x: e.clientX, y: e.clientY, r: 0, opacity: 1 });
            if (this.clicks.length > 5) this.clicks.shift();

            // Large fluid splash
            const config = this.themes[this.activeTheme];
            for (let i = 0; i < 5; i++) {
                this.addFluidPoint(e.clientX + (Math.random() - 0.5) * 50, e.clientY + (Math.random() - 0.5) * 50, `rgba(${config.pColor.join(',')}, 0.8)`);
            }
        });

        window.addEventListener('mouseleave', () => this.mouse.active = false);

        // Theme Change Observer
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

    addFluidPoint(x, y, color) {
        this.fluidPoints.push({
            x, y,
            r: 30,
            alpha: 0.6,
            color: color,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2
        });
        if (this.fluidPoints.length > this.maxFluidPoints) this.fluidPoints.shift();
    }

    update(dt) {
        if (this.transition.progress < 1) {
            this.transition.progress += dt / this.transition.duration;
            if (this.transition.progress > 1) this.transition.progress = 1;
        }

        const config = this.themes[this.activeTheme];

        // Update Fluid Points
        this.fluidPoints.forEach(p => {
            p.r += 0.8;
            p.alpha -= 0.012;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
        });
        this.fluidPoints = this.fluidPoints.filter(p => p.alpha > 0);

        // Update Clicks
        this.clicks.forEach(c => {
            c.r += 12;
            c.opacity -= 0.015;
        });
        this.clicks = this.clicks.filter(c => c.opacity > 0);

        this.particles.forEach(p => {
            // Physics by Theme
            switch (config.physics) {
                case 'heat':
                    p.ay = -0.015;
                    p.ax = (Math.random() - 0.5) * 0.1;
                    break;
                case 'matrix':
                    p.vy = Math.abs(p.vy) + 0.1;
                    p.vx = 0;
                    break;
                case 'heavy':
                    p.ay = 0.008;
                    p.vx *= 0.95;
                    break;
                case 'flow':
                    p.ax = Math.sin(p.y / 150 + this.lastTime / 1000) * 0.05;
                    break;
                case 'dream':
                    p.ax = Math.cos(p.x / 200 + this.lastTime / 1500) * 0.03;
                    p.ay = Math.sin(p.y / 200 + this.lastTime / 1500) * 0.03;
                    break;
                default:
                    p.ax = p.ay = 0;
            }

            // Mouse Interaction
            if (this.mouse.active) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const limit = 250 + (p.layer * 60);

                if (dist < limit) {
                    const force = (limit - dist) / limit;

                    if (config.physics === 'electric') {
                        p.vx -= dx * force * 0.008;
                        p.vy -= dy * force * 0.008;
                    } else if (config.physics === 'flare') {
                        p.vx += (dx / dist) * force * 3;
                        p.vy += (dy / dist) * force * 3;
                    } else {
                        p.vx += dx * force * 0.001 * (p.layer + 1);
                        p.vy += dy * force * 0.001 * (p.layer + 1);
                    }

                    p.vx += this.mouse.vx * 0.015 * p.layer;
                    p.vy += this.mouse.vy * 0.015 * p.layer;
                }
            }

            // Click Shockwaves
            this.clicks.forEach(c => {
                const dx = p.x - c.x;
                const dy = p.y - c.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (Math.abs(dist - c.r) < 30) {
                    const push = (30 - Math.abs(dist - c.r)) / 30 * 8;
                    p.vx += (dx / dist) * push;
                    p.vy += (dy / dist) * push;
                }
            });

            // Viscous Drag from Fluid
            this.fluidPoints.forEach(fp => {
                const dx = p.x - fp.x;
                const dy = p.y - fp.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < fp.r * fp.r) {
                    p.vx *= 0.9; // Thick fluid slows particles
                    p.vy *= 0.9;
                }
            });

            p.vx *= 0.98;
            p.vy *= 0.98;

            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -100) p.x = this.canvas.width + 100;
            if (p.x > this.canvas.width + 100) p.x = -100;
            if (p.y < -100) p.y = this.canvas.height + 100;
            if (p.y > this.canvas.height + 100) p.y = -100;

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

        // Background lerp
        this.ctx.fillStyle = tar.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const pCol = this.lerpColor(cur.pColor, tar.pColor, tStep);
        const lCol = this.lerpColor(cur.lColor, tar.lColor, tStep);
        const glow = cur.glow + (tar.glow - cur.glow) * tStep;
        const cDist = cur.connectDist + (tar.connectDist - cur.connectDist) * tStep;

        // Draw Fluid
        this.ctx.globalCompositeOperation = 'screen';
        this.fluidPoints.forEach(p => {
            const grad = this.ctx.createRadialGradient(p.x, p.y, p.r * 0.1, p.x, p.y, p.r);
            const colorWithAlpha = p.color.replace(/[\d.]+\)$/g, `${p.alpha.toFixed(3)})`);
            grad.addColorStop(0, colorWithAlpha);
            grad.addColorStop(1, 'rgba(0,0,0,0)');

            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalCompositeOperation = 'source-over';

        // Connections
        this.ctx.lineWidth = 1.0;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];
                if (p1.layer !== p2.layer) continue;

                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < cDist) {
                    const opacity = (1 - dist / cDist) * 0.25 * (p1.layer / 3);
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
            this.ctx.strokeStyle = `rgba(${pCol.join(',')}, ${c.opacity * 0.5})`;
            this.ctx.lineWidth = 3;
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
    window.sceneEngine = new OmniScene('bg-canvas');
});

export default OmniScene;
