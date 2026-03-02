class ParticleNetwork {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { alpha: true });

        this.particles = [];
        this.themeColor = { r: 99, g: 102, b: 241 }; // Default Indigo
        this.mouseX = null;
        this.mouseY = null;
        this.isActive = true;

        // Configuration
        this.density = window.innerWidth < 768 ? 60 : 120; // More particles (lights)
        this.connectionDistance = 180; // Even broader connectivity for a denser network
        this.interactionRadius = 250; // Larger mouse attraction radius for better flow
        this.baseSpeed = 0.4;

        this.init();
        this.bindEvents();
        this.animate();
    }

    start() {
        if (!this.isActive) {
            this.isActive = true;
            this.animate();
        }
    }

    stop() {
        this.isActive = false;
    }

    init() {
        this.resize();
        this.updateThemeColor();
        this.particles = [];
        for (let i = 0; i < this.density; i++) {
            this.particles.push(this.createParticle());
        }
    }

    createParticle() {
        // Parallax Layering: Z defines speed, size, and blur
        const z = Math.random(); // 0 (far/bg) to 1 (near/fg)

        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            z: z,
            size: z * 3 + 1.0,
            vx: (Math.random() - 0.5) * this.baseSpeed * (z + 0.5),
            vy: (Math.random() - 0.5) * this.baseSpeed * (z + 0.5),
        };
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateThemeColor() {
        // Extract --accent-rgb color from body (or fallback to hex parse)
        const styles = getComputedStyle(document.body);
        const rgbStr = styles.getPropertyValue('--accent-rgb').trim();
        if (rgbStr) {
            const parts = rgbStr.split(',').map(s => parseInt(s.trim(), 10));
            if (parts.length === 3 && !isNaN(parts[0])) {
                this.themeColor.r = parts[0];
                this.themeColor.g = parts[1];
                this.themeColor.b = parts[2];
                return;
            }
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.init(); // Re-seed to fit the new screen
        });

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        window.addEventListener('mouseleave', () => {
            this.mouseX = null;
            this.mouseY = null;
        });

        // Listen for internal theme changes robustly
        const observer = new MutationObserver(() => this.updateThemeColor());
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Trigger an initial color extraction after load
        setTimeout(() => this.updateThemeColor(), 50);
    }

    animate() {
        if (!this.isActive) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const pCount = this.particles.length;
        const connDistSq = this.connectionDistance * this.connectionDistance;
        const colorPrefix = `rgba(${this.themeColor.r}, ${this.themeColor.g}, ${this.themeColor.b},`;

        // Update and draw dots in one pass
        for (let i = 0; i < pCount; i++) {
            let p = this.particles[i];

            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            if (this.mouseX !== null && this.mouseY !== null) {
                let dx = this.mouseX - p.x;
                let dy = this.mouseY - p.y;
                let distSq = dx * dx + dy * dy;

                if (distSq < this.interactionRadius * this.interactionRadius) {
                    const distance = Math.sqrt(distSq);
                    const force = (this.interactionRadius - distance) / this.interactionRadius;
                    p.x += dx * force * 0.012 * p.z;
                    p.y += dy * force * 0.012 * p.z;
                }
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            let dotOpacity = Math.min(1, p.z * 0.7 + 0.2);
            this.ctx.fillStyle = `${colorPrefix} ${dotOpacity})`;
            this.ctx.fill();
        }

        // Connections pass - Batching lines for performance
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i < pCount; i++) {
            let p = this.particles[i];
            for (let j = i + 1; j < pCount; j++) {
                let p2 = this.particles[j];

                // Parallax plane optimization
                if (Math.abs(p.z - p2.z) > 0.3) continue;

                let dx = p.x - p2.x;
                let dy = p.y - p2.y;
                let distSq = dx * dx + dy * dy;

                if (distSq < connDistSq) {
                    const distance = Math.sqrt(distSq);
                    let opacity = (1 - (distance / this.connectionDistance)) * 0.18;
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = `${colorPrefix} ${opacity})`;
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }

        requestAnimationFrame(() => this.animate());
    }
}

export default ParticleNetwork;
