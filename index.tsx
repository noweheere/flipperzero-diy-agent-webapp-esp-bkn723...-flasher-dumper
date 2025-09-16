// Fix: Add missing Web Serial API type definitions.
// This resolves the "Cannot find name 'SerialPort'" and "Property 'serial' does not exist on type 'Navigator'" errors.
interface SerialPort {
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
}

interface Navigator {
    serial: {
        requestPort(): Promise<SerialPort>;
    };
}

// DOM Elements
const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
const baudRateInput = document.getElementById('baudRate') as HTMLInputElement;
const fileInput = document.getElementById('binFile') as HTMLInputElement;
const flashButton = document.getElementById('flashButton') as HTMLButtonElement;
const eraseButton = document.getElementById('eraseButton') as HTMLButtonElement;
const dumpButton = document.getElementById('dumpButton') as HTMLButtonElement;
const dumpAddrInput = document.getElementById('dumpAddr') as HTMLInputElement;
const dumpLenInput = document.getElementById('dumpLen') as HTMLInputElement;
const progressBar = document.getElementById('progressBar') as HTMLDivElement;
const logElement = document.getElementById('log') as HTMLPreElement;
const wiringCanvas = document.getElementById('wiringCanvas') as HTMLCanvasElement;

let port: SerialPort | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let binaryData: ArrayBuffer | null = null;

// --- Utility Functions ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- State Management ---
function setUIState(isConnected: boolean, isBusy: boolean = false) {
    connectButton.textContent = isConnected ? 'Disconnect' : 'Connect';
    connectButton.disabled = isBusy;
    
    const canPerformActions = isConnected && !isBusy;
    flashButton.disabled = !canPerformActions || !binaryData;
    eraseButton.disabled = !canPerformActions;
    dumpButton.disabled = !canPerformActions;
}

// --- Logging ---
function log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    logElement.textContent += `[${timestamp}] ${message}\n`;
    logElement.scrollTop = logElement.scrollHeight; // Auto-scroll
}

// --- Progress Bar ---
function updateProgress(value: number) {
    const percentage = Math.round(value);
    const percentageStr = `${percentage}%`;
    progressBar.style.width = percentageStr;
    progressBar.textContent = percentageStr;
    progressBar.setAttribute('aria-valuenow', percentage.toString());
}

// --- Web Serial Logic ---
async function connect() {
    if (port) {
        try {
            if (reader) {
                await reader.cancel();
                reader.releaseLock();
            }
            if (writer) {
                await writer.close();
                writer.releaseLock();
            }
            await port.close();
        } catch (error) {
            console.error("Error while disconnecting: ", error);
        } finally {
            port = null;
            reader = null;
            writer = null;
            log('Disconnected.');
            setUIState(false);
        }
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: parseInt(baudRateInput.value, 10) });

        writer = port.writable!.getWriter();
        reader = port.readable!.getReader();

        log('Connected successfully.');
        setUIState(true);
    } catch (error) {
        log(`Error connecting: ${(error as Error).message}`);
        port = null;
    }
}

// --- File Handling ---
function handleFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        binaryData = null;
        if(port) flashButton.disabled = true;
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = (e) => {
        binaryData = e.target?.result as ArrayBuffer;
        log(`File selected: ${file.name} (${binaryData.byteLength} bytes)`);
        if (port) {
            flashButton.disabled = false;
        }
    };
    fileReader.onerror = (e) => {
        log(`Error reading file: ${e.target?.error?.message}`);
        binaryData = null;
        if(port) flashButton.disabled = true;
    };
    fileReader.readAsArrayBuffer(file);
}

// --- Actions ---
async function handleFlash() {
    if (!port || !binaryData) {
        log('Error: Not connected or no file selected.');
        return;
    }
    log('Starting flash process (simulation)...');
    setUIState(true, true);
    updateProgress(0);
    const totalSteps = 100;
    for (let i = 0; i <= totalSteps; i++) {
        await sleep(20);
        updateProgress((i / totalSteps) * 100);
    }
    log('Flash complete.');
    updateProgress(0);
    setUIState(true);
}

async function handleErase() {
    if (!port) {
        log('Error: Not connected.');
        return;
    }
    log('Starting erase process (simulation)...');
    setUIState(true, true);
    updateProgress(0);
    await sleep(2000);
    updateProgress(100);
    log('Erase complete.');
    updateProgress(0);
    setUIState(true);
}

async function handleDump() {
    if (!port || !reader) {
        log('Error: Not connected.');
        return;
    }
    const address = parseInt(dumpAddrInput.value);
    const length = parseInt(dumpLenInput.value);

    if (isNaN(address) || isNaN(length) || length <= 0) {
        log('Error: Invalid address or length.');
        return;
    }

    log(`Dumping ${length} bytes from address 0x${address.toString(16)}...`);
    setUIState(true, true);
    updateProgress(0);

    // This is a placeholder for the actual dump logic.
    // A real implementation would send a "read memory" command
    // and then read the specified number of bytes from the serial port.
    try {
        // 1. Simulate sending command
        const command = new Uint8Array([0x01, 0x02, 0x03, 0x04]); // Example command
        await writer?.write(command);
        
        // 2. Simulate receiving data
        log("Received data:");
        let hexString = '';
        for (let i = 0; i < length; i++) {
            if (i % 16 === 0) {
                if (i > 0) log(hexString);
                hexString = `0x${(address + i).toString(16).padStart(8, '0')}: `;
            }
            const randomByte = Math.floor(Math.random() * 256);
            hexString += randomByte.toString(16).padStart(2, '0') + ' ';
            updateProgress((i + 1) / length * 100);
            await sleep(5);
        }
        if (hexString) log(hexString.trim());

        log('Dump complete.');
    } catch (error) {
        log(`Error during dump: ${(error as Error).message}`);
    } finally {
        updateProgress(0);
        setUIState(true);
    }
}


// --- Wiring Diagram ---
function drawWiringDiagram() {
    const ctx = wiringCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, wiringCanvas.width, wiringCanvas.height);
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    const flipper = { x: 50, y: 50, w: 150, h: 100 };
    const devBoard = { x: 360, y: 50, w: 150, h: 100 };

    // Draw boards
    ctx.strokeStyle = '#333';
    ctx.strokeRect(flipper.x, flipper.y, flipper.w, flipper.h);
    ctx.fillText('Flipper Zero', flipper.x + flipper.w / 2, flipper.y + 20);

    ctx.strokeRect(devBoard.x, devBoard.y, devBoard.w, devBoard.h);
    ctx.fillText('Wi-Fi Dev Board', devBoard.x + devBoard.w / 2, devBoard.y + 20);

    // Draw pins and connections
    const pins = [
        { name: 'GND', flipperPin: 'Pin 8', boardPin: 'GND', y: 60, color: 'black' },
        { name: '5V', flipperPin: 'Pin 1', boardPin: '5V', y: 85, color: 'red' },
        { name: 'TX', flipperPin: 'Pin 13', boardPin: 'RX', y: 110, color: 'orange' },
        { name: 'RX', flipperPin: 'Pin 14', boardPin: 'TX', y: 135, color: 'green' },
    ];

    ctx.font = '10px Arial';
    pins.forEach(pin => {
        const startX = flipper.x + flipper.w;
        const endX = devBoard.x;

        // Draw labels
        ctx.textAlign = 'right';
        ctx.fillText(`${pin.name} (${pin.flipperPin})`, startX - 5, pin.y + 3);
        ctx.textAlign = 'left';
        ctx.fillText(pin.boardPin, endX + 5, pin.y + 3);

        // Draw lines
        ctx.beginPath();
        ctx.strokeStyle = pin.color;
        ctx.moveTo(startX, pin.y);
        ctx.lineTo(endX, pin.y);
        ctx.stroke();
    });
}


// --- Event Listeners ---
connectButton.addEventListener('click', connect);
fileInput.addEventListener('change', handleFileSelect);
flashButton.addEventListener('click', handleFlash);
eraseButton.addEventListener('click', handleErase);
dumpButton.addEventListener('click', handleDump);

// Initial UI state and diagram
setUIState(false);
drawWiringDiagram();