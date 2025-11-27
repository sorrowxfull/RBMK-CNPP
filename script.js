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
const powerPercentValEl = document.getElementById('power-percent-val');
const powerPercentBarEl = document.getElementById('power-percent-bar');
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
                temp: 20, // Start cool
                timer: 0, // For decay/regen
                boil: 0 // Boiling effect intensity
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
        if (state.isScrammed) {
            state.isScrammed = false;
            statusEl.textContent = "NORMAL";
            statusEl.style.color = "var(--text-color)";
            statusEl.style.borderColor = "var(--text-color)";
        }
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

// Create a noise buffer for realistic Geiger clicks
let noiseBuffer;
function getGeigerNoise() {
    if (!audioCtx) return null;
    if (!noiseBuffer) {
        // Shorter buffer for a "pop" rather than a "click"
        const bufferSize = audioCtx.sampleRate * 0.005; // 5ms
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // Soften the noise (less harsh static)
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
    }
    return noiseBuffer;
}

function playGeigerClick() {
    if (!state.audioEnabled || !audioCtx) return;

    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;

    const source = audioCtx.createBufferSource();
    source.buffer = getGeigerNoise();

    // Bandpass filter to make it sound more like a tube discharge
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1;

    const gain = audioCtx.createGain();
    // Much quieter
    gain.gain.value = 0.1 + Math.random() * 0.1;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    // Slight pitch variation
    source.playbackRate.value = 0.9 + Math.random() * 0.2;

    source.start(t);
}

function updateAudio() {
    if (!state.audioEnabled || !audioCtx) return;

    // Proportional to neutron count (particles)
    // Base rate (background radiation) + particle contribution
    // 0 particles = ~2 clicks/sec
    // 500 particles = ~52 clicks/sec (continuous crackle)
    const activeNeutrons = state.particles.length;
    const clickRate = 2 + (activeNeutrons / 10);

    if (Date.now() > nextClickTime) {
        playGeigerClick();
        // Randomize interval for natural irregularity
        nextClickTime = Date.now() + (1000 / clickRate) * (0.5 + Math.random());
    }
}

function scram() {
    if (state.isScrammed) return;
    state.isScrammed = true;
    statusEl.textContent = "SCRAM IN PROGRESS";
    statusEl.style.color = "red";
    statusEl.style.borderColor = "red";

    const interval = setInterval(() => {
        if (!state.isScrammed) {
            clearInterval(interval);
            return;
        }

        if (state.controlRodPosition < 100) {
            state.controlRodPosition += 1;
            rodControlEl.value = state.controlRodPosition;
            rodValEl.textContent = state.controlRodPosition;
        } else {
            clearInterval(interval);
            statusEl.textContent = "SHUTDOWN";
            state.isScrammed = false;
            setTimeout(() => {
                if (statusEl.textContent === "SHUTDOWN") {
                    statusEl.textContent = "NORMAL";
                    statusEl.style.color = "var(--text-color)";
                    statusEl.style.borderColor = "var(--text-color)";
                }
            }, 2000);
        }
    }, 50);
}

function updatePhysics() {
    let totalGridHeat = 0;
    let activeFuelCount = 0;

    // 1. Grid Updates (Decay/Regen)
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = state.grid[x][y];

            // Decay boiling effect
            if (cell.boil > 0) cell.boil *= 0.9;

            // Water Cooling / Heat Decay
            if (cell.temp > 20) {
                cell.temp -= 0.5 * SPEED_MULTIPLIER;
            }
            if (cell.temp < 20) cell.temp = 20;

            totalGridHeat += cell.temp;

            if (cell.type === TYPE_FUEL) {
                if (cell.fuelState === FUEL_URANIUM) activeFuelCount++;

                // Decay Logic
                if (cell.fuelState === FUEL_SPENT) {
                    if (Math.random() < 0.001 * SPEED_MULTIPLIER) {
                        if (Math.random() < 0.7) cell.fuelState = FUEL_URANIUM;
                        else cell.fuelState = FUEL_XENON;
                    }
                } else if (cell.fuelState === FUEL_XENON) {
                    if (Math.random() < 0.0005 * SPEED_MULTIPLIER) {
                        cell.fuelState = FUEL_SPENT;
                    }
                }
            }
        }
    }

    // 2. Particle Movement & Collision
    for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.update();

        let gx = Math.floor(p.x / CELL_SIZE);
        let gy = Math.floor(p.y / CELL_SIZE);

        if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
            let cell = state.grid[gx][gy];

            // Boiling Effect & Heating
            // Scale with SPEED_MULTIPLIER to compensate for skipping cells at high speeds
            if (cell.type !== TYPE_ROD && cell.type !== TYPE_MODERATOR) {
                cell.boil = Math.min(100, cell.boil + 30 * SPEED_MULTIPLIER);
                cell.temp += 2 * SPEED_MULTIPLIER; // Heat up water/fuel proportional to speed
            }

            // Interaction Logic
            if (cell.type === TYPE_MODERATOR) {
                if (p.type === 'fast') {
                    p.type = 'thermal';
                    let currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                    let scale = NEUTRON_SPEED_THERMAL / currentSpeed;
                    p.vx *= scale;
                    p.vy *= scale;
                }
            } else if (cell.type === TYPE_ROD) {
                let rodDepth = (state.controlRodPosition / 100) * ROWS;
                if (gy < rodDepth) {
                    state.particles.splice(i, 1);
                    continue;
                }
            } else if (cell.type === TYPE_FUEL) {
                if (p.type === 'thermal') {
                    if (cell.fuelState === FUEL_URANIUM) {
                        if (Math.random() < 0.2) {
                            state.particles.splice(i, 1);

                            // Uranium Resilience Logic
                            let chanceToSpend = 1.0;
                            if (cell.temp > 500) chanceToSpend = 0.33;

                            if (Math.random() < chanceToSpend) {
                                cell.fuelState = FUEL_SPENT;
                            }

                            for (let n = 0; n < 2; n++) {
                                state.particles.push(new Particle(p.x, p.y, 'fast'));
                            }
                            cell.temp += 50;
                            state.power += 10;
                            continue;
                        }
                    } else if (cell.fuelState === FUEL_XENON) {
                        if (Math.random() < 0.5) {
                            state.particles.splice(i, 1);
                            cell.fuelState = FUEL_SPENT;
                            continue;
                        }
                    }
                }
            }
        }

        if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Spontaneous Fission
    if (state.particles.length < MAX_PARTICLES && Math.random() < 0.1 * SPEED_MULTIPLIER) {
        let rx = Math.random() * CANVAS_WIDTH;
        let ry = Math.random() * CANVAS_HEIGHT;
        state.particles.push(new Particle(rx, ry, 'fast'));
    }

    // Global Stats Update
    let targetPower = state.particles.length * 6.5;
    state.power += (targetPower - state.power) * 0.1;

    let avgTemp = totalGridHeat / (COLS * ROWS);
    state.temperature += (avgTemp - state.temperature) * 0.05;

    state.radiation = 15 + state.power * 0.5;
}

function draw() {
    // Clear
    ctx.fillStyle = '#d0e8f2'; // Base Water background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            let cell = state.grid[x][y];
            let px = x * CELL_SIZE;
            let py = y * CELL_SIZE;

            // Draw Water Heat Effect (Pink -> Red)
            if (cell.temp > 50) {
                let intensity = Math.min(1, (cell.temp - 50) / 450);
                let r = 255;
                let g = 192 * (1 - intensity);
                let b = 203 * (1 - intensity);
                let a = Math.min(0.8, intensity * 0.8);

                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            }

            // Draw Boiling Effect (Bubbles)
            if (cell.boil > 1) {
                ctx.fillStyle = `rgba(255, 255, 255, ${cell.boil / 150})`;
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

                if (cell.boil > 50) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.beginPath();
                    ctx.arc(px + CELL_SIZE * 0.3, py + CELL_SIZE * 0.3, 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(px + CELL_SIZE * 0.7, py + CELL_SIZE * 0.6, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            if (cell.type === TYPE_MODERATOR) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
                ctx.strokeStyle = '#999';
                ctx.strokeRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
            } else if (cell.type === TYPE_ROD) {
                let rodDepth = (state.controlRodPosition / 100) * ROWS;
                if (y < rodDepth) {
                    ctx.fillStyle = '#444';
                    ctx.fillRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
                } else {
                    ctx.strokeStyle = '#aaa';
                    ctx.strokeRect(px + 5, py, CELL_SIZE - 10, CELL_SIZE);
                }
            } else if (cell.type === TYPE_FUEL) {
                let color = '#ccc';
                if (cell.fuelState === FUEL_URANIUM) color = '#00cc00';
                else if (cell.fuelState === FUEL_XENON) color = '#222';

                // Heat glow for fuel specifically
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
                ctx.shadowBlur = 0;
            }
        }
    }

    // Draw Particles
    state.particles.forEach(p => p.draw());

    // Update UI
    // Max Power roughly 3200 MW for 100%
    powerValEl.textContent = Math.floor(state.power);
    powerBarEl.style.width = Math.min(100, (state.power / 3200) * 100) + '%';

    // Power % - Allow > 100%
    let pPercent = (state.power / 3200) * 100;
    if (powerPercentValEl) {
        powerPercentValEl.textContent = pPercent.toFixed(1);
        if (pPercent > 100) powerPercentValEl.style.color = 'red';
        else powerPercentValEl.style.color = 'var(--text-color)';
    }
    if (powerPercentBarEl) {
        powerPercentBarEl.style.width = Math.min(100, pPercent) + '%';
        if (pPercent > 100) powerPercentBarEl.style.backgroundColor = 'red';
        else powerPercentBarEl.style.backgroundColor = 'var(--text-color)';
    }

    tempValEl.textContent = Math.floor(state.temperature);
    // Max temp ~2000
    tempBarEl.style.width = Math.min(100, (state.temperature / 2000) * 100) + '%';

    radValEl.textContent = Math.floor(state.radiation);
    radBarEl.style.width = Math.min(100, (Math.log10(state.radiation) / 5) * 100) + '%';
}

function loop() {
    updatePhysics();
    draw();
    updateAudio();
    requestAnimationFrame(loop);
}

init();
