// Simulation Constants
const COLS = 31; // Adjusted for 6-column pattern (5 * 6 + 1)
const ROWS = 20;
const CELL_SIZE = 30; // Bigger squares
const CANVAS_WIDTH = COLS * CELL_SIZE;
const CANVAS_HEIGHT = ROWS * CELL_SIZE;

// Particle Constants
const MAX_PARTICLES = 500;
let NEUTRON_SPEED_FAST = 2; // Slower default
let NEUTRON_SPEED_THERMAL = 1; // Slower default
let SPEED_MULTIPLIER = 1;

// State
let state = {
    power: 0,
    temperature: 300,
    radiation: 15,
    controlRodPosition: 100, // % Inserted
    grid: [], // 2D array of cells
    particles: [],
    audioEnabled: false,
    isScrammed: false
};

// Audio
let audioCtx;
let nextClickTime = 0;

// DOM
const canvas = document.getElementById('reactor-canvas');
const ctx = canvas.getContext('2d');
const powerValEl = document.getElementById('power-val');
const powerBarEl = document.getElementById('power-bar');
const tempValEl = document.getElementById('temp-val');
const tempBarEl = document.getElementById('temp-bar');
const radValEl = document.getElementById('rad-val');
const radBarEl = document.getElementById('rad-bar');
const rodControlEl = document.getElementById('rod-control');
const rodValEl = document.getElementById('rod-val');
const speedControlEl = document.getElementById('speed-control');
const speedValEl = document.getElementById('speed-val');
const az5Btn = document.getElementById('az5-btn');
const audioToggle = document.getElementById('audio-toggle');
const statusEl = document.getElementById('system-status');

// Cell Types
const TYPE_MODERATOR = 'moderator';
const TYPE_ROD = 'rod';
const TYPE_FUEL = 'fuel';

// Fuel States
const FUEL_URANIUM = 'uranium';
const FUEL_SPENT = 'spent'; // Non-uranium
const FUEL_XENON = 'xenon';

class Particle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'fast' or 'thermal'
        const angle = Math.random() * Math.PI * 2;
        // Base speed
        this.baseSpeed = type === 'fast' ? NEUTRON_SPEED_FAST : NEUTRON_SPEED_THERMAL;
        this.vx = Math.cos(angle) * this.baseSpeed;
        this.vy = Math.sin(angle) * this.baseSpeed;
        this.life = 200; // Longer life for slower speed
    }

    update() {
        // Apply speed multiplier
        this.x += this.vx * SPEED_MULTIPLIER;
        this.y += this.vy * SPEED_MULTIPLIER;
        this.life -= 0.5 * SPEED_MULTIPLIER;

        // Bounce off walls
        if (this.x < 0 || this.x > CANVAS_WIDTH) this.vx *= -1;
        if (this.y < 0 || this.y > CANVAS_HEIGHT) this.vy *= -1;
    }

    draw() {
        ctx.beginPath();
        // Bigger dot for visibility
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        if (this.type === 'fast') {
            ctx.fillStyle = '#fff'; // Fast neutron (White)
            ctx.strokeStyle = '#000'; // Black outline
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            ctx.fillStyle = '#555'; // Thermal neutron (Grey/Dark)
        }
        ctx.fill();
    }
}

function init() {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Initialize Grid
    for (let x = 0; x < COLS; x++) {
        let colType = TYPE_FUEL;
        const modX = x % 6;

        // Pattern: Mod, Dot, Dot, Rod, Dot, Dot, Mod...
        if (modX === 0) colType = TYPE_MODERATOR;
        else if (modX === 3) colType = TYPE_ROD;

        state.grid[x] = [];
        for (let y = 0; y < ROWS; y++) {
            let cell = {
                x: x,
                y: y,
                type: colType,
                fuelState: FUEL_URANIUM, // Default
                temp: 300,
                timer: 0 // For decay/regen
            };

            // Randomize fuel slightly
            if (colType === TYPE_FUEL) {
                const r = Math.random();
                if (r < 0.1) cell.fuelState = FUEL_SPENT;
                else if (r < 0.15) cell.fuelState = FUEL_XENON;
            }
            state.grid[x][y] = cell;
        }
    }

    // Listeners
    rodControlEl.addEventListener('input', (e) => {
        state.controlRodPosition = parseInt(e.target.value);
        rodValEl.textContent = state.controlRodPosition;
    });

    if (speedControlEl) {
        speedControlEl.addEventListener('input', (e) => {
            SPEED_MULTIPLIER = parseFloat(e.target.value);
            if (speedValEl) speedValEl.textContent = SPEED_MULTIPLIER;
        });
    }

    az5Btn.addEventListener('click', scram);
    audioToggle.addEventListener('change', (e) => {
        state.audioEnabled = e.target.checked;
        if (state.audioEnabled && !audioCtx) initAudio();
    });

    requestAnimationFrame(loop);
}

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playGeigerClick() {
    if (!state.audioEnabled || !audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 100 + Math.random() * 50;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
}

function updateAudio() {
    if (!state.audioEnabled || !audioCtx) return;
    const clickRate = Math.max(1, Math.log10(state.radiation) * 5);
    if (Date.now() > nextClickTime) {
        playGeigerClick();
        nextClickTime = Date.now() + (1000 / clickRate) * (0.5 + Math.random());
    }
}

function scram() {
    if (state.isScrammed) return;
    state.isScrammed = true;
    statusEl.textContent = "SCRAM IN PROGRESS";
    statusEl.style.color = "red";
    const interval = setInterval(() => {
        if (state.controlRodPosition < 100) {
            state.controlRodPosition += 1;
            rodControlEl.value = state.controlRodPosition;
            rodValEl.textContent = state.controlRodPosition;
        } else {
            clearInterval(interval);
            statusEl.textContent = "SHUTDOWN";
        }
    }, 50);
}

function updatePhysics() {
    // 1. Grid Updates (Decay/Regen)
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = state.grid[x][y];
            if (cell.type === TYPE_FUEL) {
                // Decay Logic
                if (cell.fuelState === FUEL_SPENT) {
                    // Chance to turn into Xenon or Uranium
                    if (Math.random() < 0.001 * SPEED_MULTIPLIER) {
                        if (Math.random() < 0.7) cell.fuelState = FUEL_URANIUM; // Regenerate
                        else cell.fuelState = FUEL_XENON; // Poison
                    }
                } else if (cell.fuelState === FUEL_XENON) {
                    // Xenon decays back to Uranium eventually? Or just stays?
                    // Let's say it decays slowly back to Spent or Uranium
                    if (Math.random() < 0.0005 * SPEED_MULTIPLIER) {
                        cell.fuelState = FUEL_SPENT;
                    }
                }

                // Cooling
                if (cell.temp > 300) cell.temp -= 0.5 * SPEED_MULTIPLIER;
            }
        }
    }

    // 2. Particle Movement & Collision
    for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.update();

        // Check Grid Collision
        let gx = Math.floor(p.x / CELL_SIZE);
        let gy = Math.floor(p.y / CELL_SIZE);

        if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
            let cell = state.grid[gx][gy];

            // Interaction Logic
            if (cell.type === TYPE_MODERATOR) {
                // Moderator slows fast neutrons to thermal
                if (p.type === 'fast') {
                    p.type = 'thermal';
                    // Slow down velocity vector
                    let currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                    let scale = NEUTRON_SPEED_THERMAL / currentSpeed;
                    p.vx *= scale;
                    p.vy *= scale;
                }
            } else if (cell.type === TYPE_ROD) {
                let rodDepth = (state.controlRodPosition / 100) * ROWS;
                if (gy < rodDepth) {
                    // Absorbed
                    state.particles.splice(i, 1);
                    continue;
                }
            } else if (cell.type === TYPE_FUEL) {
                if (p.type === 'thermal') {
                    if (cell.fuelState === FUEL_URANIUM) {
                        // Fission!
                        if (Math.random() < 0.2) { // Increased chance
                            state.particles.splice(i, 1);

                            // Turn Uranium into Spent Fuel
                            cell.fuelState = FUEL_SPENT;

                            // Release 2-3 fast neutrons
                            for (let n = 0; n < 2; n++) {
                                state.particles.push(new Particle(p.x, p.y, 'fast'));
                            }
                            // Heat up
                            cell.temp += 20;
                            state.power += 1;
                            continue;
                        }
                    } else if (cell.fuelState === FUEL_XENON) {
                        // Xenon absorbs thermal neutrons
                        if (Math.random() < 0.5) {
                            state.particles.splice(i, 1);
                            // Burn off xenon -> Spent
                            cell.fuelState = FUEL_SPENT;
                            continue;
                        }
                    }
                }
            }
        }

        if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Spontaneous Fission (Source)
    if (state.particles.length < MAX_PARTICLES && Math.random() < 0.1 * SPEED_MULTIPLIER) {
        // Random start point
        let rx = Math.random() * CANVAS_WIDTH;
        let ry = Math.random() * CANVAS_HEIGHT;
        state.particles.push(new Particle(rx, ry, 'fast'));
    }

    // Global Stats Update
    state.power *= 0.98; // Decay
    state.temperature = 300 + state.power * 0.5;
    state.radiation = 15 + state.power * 0.2;
}

function draw() {
    // Clear
    ctx.fillStyle = '#d0e8f2'; // Water background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = state.grid[x][y];
            let px = x * CELL_SIZE;
            let py = y * CELL_SIZE;

            if (cell.type === TYPE_MODERATOR) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
                ctx.strokeStyle = '#999';
                ctx.strokeRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
            } else if (cell.type === TYPE_ROD) {
                // Draw Rod if present
                let rodDepth = (state.controlRodPosition / 100) * ROWS;
                if (y < rodDepth) {
                    ctx.fillStyle = '#444'; // Dark Grey Rod
                    ctx.fillRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
                } else {
                    // Empty channel (water)
                    ctx.strokeStyle = '#aaa';
                    ctx.strokeRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
                }
            } else if (cell.type === TYPE_FUEL) {
                // Draw Fuel Dot
                let color = '#ccc'; // Non-uranium (Grey)
                if (cell.fuelState === FUEL_URANIUM) color = '#00cc00'; // Green
                else if (cell.fuelState === FUEL_XENON) color = '#222'; // Dark

                // Heat glow
                if (cell.temp > 500) {
                    ctx.shadowBlur = (cell.temp - 500) / 50;
                    ctx.shadowColor = 'red';
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.beginPath();
                ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, CELL_SIZE / 3, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.shadowBlur = 0; // Reset
            }
        }
    }

    // Draw Particles
    state.particles.forEach(p => p.draw());

    // Update UI
    powerValEl.textContent = Math.floor(state.power);
    powerBarEl.style.width = Math.min(100, state.power) + '%';
    tempValEl.textContent = Math.floor(state.temperature);
    radValEl.textContent = Math.floor(state.radiation);
}

function loop() {
    updatePhysics();
    draw();
    updateAudio();
    requestAnimationFrame(loop);
}

init();
