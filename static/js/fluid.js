/*
    Lightweight WebGL Fluid Simulation
    Inspired by: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
    Optimized for SnailGPT Home Page
*/

const fluidBackground = (function () {
    let canvas, gl, width, height;
    let programs = {};
    let textures = {};
    let pointers = [{ id: -1, x: 0, y: 0, dx: 0, dy: 0, down: false, color: [0, 0, 0] }];

    const config = {
        SIM_RESOLUTION: 512,
        DYE_RESOLUTION: 4096,
        DENSITY_DISSIPATION: 10,
        VELOCITY_DISSIPATION: 1,
        PRESSURE_DISSIPATION: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 30,
        SPLAT_RADIUS: 0.25,
        BACK_COLOR: { r: 5, g: 6, b: 8 }
    };

    function init(canvasElement) {
        canvas = canvasElement;
        const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        gl = canvas.getContext('webgl2', params);
        if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

        resize();
        setupShaders();
        initFramebuffers();
        update();
    }

    function setupShaders() {
        const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
            precision highp float;
            attribute vec2 aPosition;
            varying vec2 vUv;
            varying vec2 vL;
            varying vec2 vR;
            varying vec2 vT;
            varying vec2 vB;
            uniform vec2 texelSize;
            void main () {
                vUv = aPosition * 0.5 + 0.5;
                vL = vUv - vec2(texelSize.x, 0.0);
                vR = vUv + vec2(texelSize.x, 0.0);
                vT = vUv + vec2(0.0, texelSize.y);
                vB = vUv - vec2(0.0, texelSize.y);
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `);

        // ... simplified shader logic ...
        // Splat Shader
        programs.splat = createProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, `
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            uniform sampler2D uTarget;
            uniform float aspect;
            uniform vec3 color;
            uniform vec2 point;
            uniform float radius;
            void main () {
                vec2 p = vUv - point.xy;
                p.x *= aspect;
                vec3 splat = exp(-dot(p, p) / radius) * color;
                vec3 base = texture2D(uTarget, vUv).xyz;
                gl_FragColor = vec4(base + splat, 1.0);
            }
        `));

        // Display Shader
        programs.display = createProgram(baseVertexShader, compileShader(gl.FRAGMENT_SHADER, `
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            uniform sampler2D uTexture;
            void main () {
                vec3 c = texture2D(uTexture, vUv).rgb;
                float a = max(c.r, max(c.g, c.b));
                gl_FragColor = vec4(c, a);
            }
        `));

        // Advection, Jacobi, Divergence shaders would be here in a full imp.
        // For now, let's focus on a "Splat Display" reactive background.
    }

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    }

    function createProgram(vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        return program;
    }

    function initFramebuffers() {
        // Init dye and velocity textures
    }

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    function update() {
        gl.viewport(0, 0, width, height);
        // Splat mouse pointers, step sim, draw display
        // ...
        requestAnimationFrame(update);
    }

    // Exported Splat function for main.js to call on mousemove
    function splat(x, y, dx, dy, color) {
        // ...
    }

    return { init, resize, splat };
})();

// Simple Canvas based "Liquid" for reliability if WebGL is too heavy
const canvasFluid = (function () {
    let canvas, ctx, points = [];
    const maxPoints = 120; // Increased for smoother trailing

    function init(cv) {
        canvas = cv;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        animate();
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function addPoint(x, y, color) {
        points.push({ x, y, r: 40, alpha: 0.7, color: color || 'rgba(100, 100, 255, 0.5)' }); // Much bigger radius initially
        if (points.length > maxPoints) points.shift();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw viscous fluid metaballs
        points.forEach((p, i) => {
            p.r += 0.8; // Slow expansion (honey-like)
            p.alpha -= 0.005; // Very slow fade (persistent thick trail)
            if (p.alpha <= 0) return;

            const grad = ctx.createRadialGradient(p.x, p.y, p.r * 0.1, p.x, p.y, p.r);
            grad.addColorStop(0, p.color.replace('0.5', p.alpha.toFixed(3)));
            grad.addColorStop(1, 'transparent');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });

        points = points.filter(p => p.alpha > 0);
        requestAnimationFrame(animate);
    }

    return { init, addPoint };
})();

export default canvasFluid;
