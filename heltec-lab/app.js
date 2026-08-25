/**
 * Heltec Hardware Lab & Interactive Explorer Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Initialize Navigation Tabs
    setupTabs();

    // Initialize Board Inspector Pinout
    setupBoardInspector();

    // Initialize LoRa Mesh Simulator
    setupMeshSimulator();

    // Initialize RF Range Calculator
    setupRangeCalculator();
});

/* ==========================================================================
   Tab Navigation Logic
   ========================================================================== */
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');

            tabBtns.forEach(b => {
                b.classList.remove('active', 'border-primary', 'bg-primary/20', 'text-white');
                b.classList.add('border-white/10', 'text-gray-400');
            });

            btn.classList.add('active', 'border-primary', 'bg-primary/20', 'text-white');
            btn.classList.remove('border-white/10', 'text-gray-400');

            tabPanes.forEach(pane => {
                if (pane.id === target) {
                    pane.classList.remove('hidden');
                } else {
                    pane.classList.add('hidden');
                }
            });
        });
    });
}

/* ==========================================================================
   1. Board Inspector Logic
   ========================================================================== */
const pinoutData = {
    'OLED Display': {
        gpio: 'GPIO 17 (SCL) / GPIO 18 (SDA)',
        type: 'Display I2C Interface',
        desc: '0.96-inch OLED screen (128x64 pixels) driven by SSD1306/SH1106 controller via internal I2C bus.',
        features: ['128x64 Resolution', 'Internal Power Bus', 'I2C Interface', 'Low Power Consumption']
    },
    'SX1262 LoRa': {
        gpio: 'GPIO 8 (NSS), GPIO 14 (RST), GPIO 12 (BUSY), GPIO 13 (DIO1)',
        type: 'Sub-GHz Transceiver',
        desc: 'Semtech SX1262 LoRa transceiver chip operating in 863-928MHz ISM bands with up to +22 dBm output power.',
        features: ['863-928 MHz Frequency', '+22 dBm Max TX Power', 'SPI Interface', 'Spreading Factors SF5 - SF12']
    },
    'ESP32-S3 Core': {
        gpio: 'Xtensa LX7 Dual-Core @ 240MHz',
        type: 'System on Chip (SoC)',
        desc: 'ESP32-S3FN8 SoC featuring dual-core 32-bit processor, 512KB SRAM, 8MB Quad SPI Flash, Wi-Fi 4 (802.11b/g/n), and Bluetooth 5 (LE).',
        features: ['240 MHz Dual-Core', '8MB Flash Memory', 'Wi-Fi 4 & BLE 5', 'Bare-Metal C++ Execution']
    },
    'Type-C USB': {
        gpio: 'GPIO 19 (D-) / GPIO 20 (D+)',
        type: 'Power & CP2102 Serial Port',
        desc: 'USB Type-C port connected via CP2102 USB-to-UART bridge chip for fast flashing, power delivery, and serial console output.',
        features: ['Auto-Reset Circuit', 'CP2102 USB-Serial Bridge', '5V Power Supply', '115200 Baud Console']
    },
    'Battery Connector': {
        gpio: 'GPIO 1 (ADC Battery Sense)',
        type: 'SH1.25 2-Pin LiPo Connector',
        desc: 'Supports 3.7V Lithium-Polymer battery input with onboard TP4054 charging circuit and voltage divider sense line.',
        features: ['3.7V LiPo Support', 'TP4054 Charging Circuit', 'ADC Battery Voltage Sense', 'Deep-Sleep Optimization']
    }
};

function setupBoardInspector() {
    const hotspots = document.querySelectorAll('.pin-hotspot');
    const titleEl = document.getElementById('pin-title');
    const gpioEl = document.getElementById('pin-gpio');
    const typeEl = document.getElementById('pin-type');
    const descEl = document.getElementById('pin-desc');
    const tagsEl = document.getElementById('pin-tags');

    function selectPin(pinName) {
        const data = pinoutData[pinName];
        if (!data) return;

        hotspots.forEach(h => {
            if (h.getAttribute('data-pin') === pinName) {
                h.classList.add('ring-4', 'ring-cyan-400');
            } else {
                h.classList.remove('ring-4', 'ring-cyan-400');
            }
        });

        titleEl.textContent = pinName;
        gpioEl.textContent = data.gpio;
        typeEl.textContent = data.type;
        descEl.textContent = data.desc;

        tagsEl.innerHTML = '';
        data.features.forEach(feat => {
            const span = document.createElement('span');
            span.className = 'px-2.5 py-1 bg-accent/10 border border-accent/20 rounded-lg text-xs text-cyan-300 font-mono';
            span.textContent = feat;
            tagsEl.appendChild(span);
        });
    }

    hotspots.forEach(h => {
        h.addEventListener('click', () => {
            const pinName = h.getAttribute('data-pin');
            selectPin(pinName);
        });
    });

    // Default select SX1262 LoRa
    selectPin('SX1262 LoRa');
}

/* ==========================================================================
   2. LoRa Mesh Network Simulator Logic
   ========================================================================== */
function setupMeshSimulator() {
    const canvas = document.getElementById('mesh-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const nodes = [
        { id: 'Node A (Gateway)', x: 100, y: 150, type: 'gateway', status: 'Active' },
        { id: 'Node B (Relay 1)', x: 280, y: 80, type: 'relay', status: 'Relaying' },
        { id: 'Node C (Relay 2)', x: 300, y: 220, type: 'relay', status: 'Relaying' },
        { id: 'Node D (Sensor)', x: 480, y: 150, type: 'sensor', status: 'Transmitting' },
    ];

    let packets = [];
    let animationId = null;

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = 280;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function drawMesh() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw connections
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        const scaleX = canvas.width / 600;

        const connections = [
            [0, 1], [0, 2], [1, 3], [2, 3]
        ];

        connections.forEach(([i, j]) => {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x * scaleX, nodes[i].y);
            ctx.lineTo(nodes[j].x * scaleX, nodes[j].y);
            ctx.stroke();
        });

        ctx.setLineDash([]);

        // Draw Nodes
        nodes.forEach((node) => {
            const x = node.x * scaleX;
            const y = node.y;

            ctx.beginPath();
            ctx.arc(x, y, 16, 0, Math.PI * 2);
            if (node.type === 'gateway') {
                ctx.fillStyle = '#06b6d4';
            } else if (node.type === 'relay') {
                ctx.fillStyle = '#8b5cf6';
            } else {
                ctx.fillStyle = '#10b981';
            }
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(node.id, x, y + 32);
        });

        // Draw Packets
        for (let i = packets.length - 1; i >= 0; i--) {
            const p = packets[i];
            const fromNode = nodes[p.from];
            const toNode = nodes[p.to];
            const scaleX = canvas.width / 600;

            const currentX = (fromNode.x + (toNode.x - fromNode.x) * p.progress) * scaleX;
            const currentY = fromNode.y + (toNode.y - fromNode.y) * p.progress;

            ctx.beginPath();
            ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();

            p.progress += 0.015;

            if (p.progress >= 1) {
                packets.splice(i, 1);
                logMeshEvent(`Packet received at ${toNode.id} (RSSI: -87 dBm, SNR: +8.5 dB)`);
            }
        }

        animationId = requestAnimationFrame(drawMesh);
    }

    drawMesh();

    const sendBtn = document.getElementById('send-packet-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const msgInput = document.getElementById('packet-payload');
            const msg = msgInput ? msgInput.value.trim() : 'TEST_PING';

            packets.push({ from: 3, to: 1, progress: 0 });
            packets.push({ from: 3, to: 2, progress: 0 });

            setTimeout(() => {
                packets.push({ from: 1, to: 0, progress: 0 });
                packets.push({ from: 2, to: 0, progress: 0 });
            }, 1200);

            logMeshEvent(`Broadcasting packet payload: "${msg || 'TEST_PING'}" from Node D`);
        });
    }
}

function logMeshEvent(text) {
    const logEl = document.getElementById('mesh-log');
    if (!logEl) return;

    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'text-gray-300 border-b border-white/5 pb-1 mb-1';
    entry.innerHTML = `<span class="text-gray-500">[${time}]</span> ${text}`;
    logEl.prepend(entry);
}

/* ==========================================================================
   3. RF Link Budget & Range Calculator
   ========================================================================== */
function setupRangeCalculator() {
    const txPowerInput = document.getElementById('tx-power');
    const freqSelect = document.getElementById('frequency');
    const sfSelect = document.getElementById('spreading-factor');
    const bwSelect = document.getElementById('bandwidth');

    const txVal = document.getElementById('tx-power-val');
    const calcDistanceEl = document.getElementById('calc-distance');
    const calcRssiEl = document.getElementById('calc-rssi');
    const calcSnrEl = document.getElementById('calc-snr');

    function calculateRange() {
        const txPower = parseFloat(txPowerInput.value);
        const freqMHz = parseFloat(freqSelect.value);
        const sf = parseInt(sfSelect.value);
        const bw = parseFloat(bwSelect.value);

        txVal.textContent = `${txPower} dBm`;

        // Receiver sensitivity calculation
        // Sensitivity = -174 + 10*log10(BW) + NF + SNR_req
        const snrTable = { 7: -7.5, 8: -10, 9: -12.5, 10: -15, 11: -17.5, 12: -20 };
        const reqSnr = snrTable[sf] || -15;
        const noiseFloor = -174 + 10 * Math.log10(bw * 1000) + 6; // 6dB Noise Figure
        const sensitivity = noiseFloor + reqSnr;

        // Link budget = TX_Power + Antenna_Gain_TX (2dBi) + Antenna_Gain_RX (2dBi) - Sensitivity
        const linkBudget = txPower + 2 + 2 - sensitivity;

        // Simplified Okumura-Hata / FSPL model estimation for Suburban/Rural LoRa
        // FSPL = 20*log10(d_km) + 20*log10(f_MHz) + 32.44
        const estimatedKm = Math.pow(10, (linkBudget - 20 * Math.log10(freqMHz) - 32.44) / 25);
        const distanceFormatted = estimatedKm > 20 ? '20+ km (Line of Sight)' : `${estimatedKm.toFixed(2)} km`;

        calcDistanceEl.textContent = distanceFormatted;
        calcRssiEl.textContent = `${sensitivity.toFixed(1)} dBm`;
        calcSnrEl.textContent = `${reqSnr} dB`;
    }

    [txPowerInput, freqSelect, sfSelect, bwSelect].forEach(input => {
        if (input) {
            input.addEventListener('input', calculateRange);
            input.addEventListener('change', calculateRange);
        }
    });

    calculateRange();
}
