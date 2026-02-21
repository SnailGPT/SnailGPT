class ParticleNetwork {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.particles = [];
        this.themeColor = { r: 99, g: 102, b: 241 }; // Default Indigo
        this.mouseX = null;
        this.mouseY = null;

        // Configuration
        this.density = 180; // More particles (lights)
        this.connectionDistance = 85; // Lower connectivity rate (max distance for lines)
        this.interactionRadius = 250; // Larger mouse attraction radius
        this.baseSpeed = 0.5;

        this.init();
        this.bindEvents();
        this.animate();
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
            size: z * 2.5 + 0.5,
            vx: (Math.random() - 0.5) * this.baseSpeed * (z + 0.5),
            vy: (Math.random() - 0.5) * this.baseSpeed * (z + 0.5),
            originX: 0,
            originY: 0
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

        const hex = styles.getPropertyValue('--primary').trim() || '#6366f1';
        if (hex.length === 7) {
            this.themeColor.r = parseInt(hex.slice(1, 3), 16);
            this.themeColor.g = parseInt(hex.slice(3, 5), 16);
            this.themeColor.b = parseInt(hex.slice(5, 7), 16);
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
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName === 'class') {
                    this.updateThemeColor();
                }
            });
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Trigger an initial color extraction after load
        setTimeout(() => this.updateThemeColor(), 50);
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw particles
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];

            // Standard movement
            p.x += p.vx;
            p.y += p.vy;

            // Boundary wrapping
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            // Mouse Interaction (Subtle Parallax Attraction)
            if (this.mouseX !== null && this.mouseY !== null) {
                let dx = this.mouseX - p.x;
                let dy = this.mouseY - p.y;
                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.interactionRadius) {
                    // Closer particles react more strongly
                    const force = (this.interactionRadius - distance) / this.interactionRadius;
                    // Adjusted force to 0.02
                    p.x += dx * force * 0.02 * p.z;
                    p.y += dy * force * 0.02 * p.z;
                }
            }

            // Draw Point
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            // Parallax fading based on Z-depth (Brighter base opacity)
            let dotOpacity = Math.min(1, p.z * 0.8 + 0.3);
            this.ctx.fillStyle = `rgba(${this.themeColor.r}, ${this.themeColor.g}, ${this.themeColor.b}, ${dotOpacity})`;
            this.ctx.fill();

            // Draw Constellation Connections
            for (let j = i + 1; j < this.particles.length; j++) {
                let p2 = this.particles[j];
                let dx = p.x - p2.x;
                let dy = p.y - p2.y;
                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.connectionDistance) {
                    // Opacity fades out as distance approaches max distance
                    let opacity = (1 - (distance / this.connectionDistance)) * 0.25;

                    // Only connect if they are somewhat on a similar parallax plane to maintain 3D illusion
                    if (Math.abs(p.z - p2.z) < 0.4) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(p.x, p.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.strokeStyle = `rgba(${this.themeColor.r}, ${this.themeColor.g}, ${this.themeColor.b}, ${opacity})`;
                        this.ctx.lineWidth = 0.5;
                        this.ctx.stroke();
                    }
                }
            }
        }

        requestAnimationFrame(this.animate.bind(this));
    }
}

export default ParticleNetwork;
