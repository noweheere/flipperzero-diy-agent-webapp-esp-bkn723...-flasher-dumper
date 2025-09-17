import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type DumpFormat = "BIN" | "Intel HEX" | "Motorola S-Record" | "ASCII/Text";

const formatOptions: DumpFormat[] = [
  "BIN",
  "Intel HEX",
  "Motorola S-Record",
  "ASCII/Text",
];

type Device = "ST-Link" | "BusPirate v3.6" | "Flipper Zero" | "FTDI_USB" | "Raspberry Pi";

const deviceDrivers: Record<Device, { wiring: string; links: { title: string; url: string }[] }> = {
  "ST-Link": {
    wiring: "ST-Link SWDIO->Target SWDIO, SWCLK->Target SWCLK, 3V3, GND, NRST (optional)",
    links: [
      { title: "ST-Link Utility (Windows)", url: "https://www.st.com/en/development-tools/stsw-link004.html" },
      { title: "stlink (Linux/macOS)", url: "https://github.com/stlink-org/stlink" },
    ],
  },
  "BusPirate v3.6": {
    wiring: "MOSI->TX/DI, MISO->RX/DO, CLK->SCK, CS->CS, 3V3, GND",
    links: [
      { title: "Bus Pirate docs", url: "http://dangerousprototypes.com/docs/Bus_Pirate" },
    ],
  },
  "Flipper Zero": {
    wiring: "Flipper UART TX->Target RX, RX->Target TX, 3V3, GND (DevBoard UART0)",
    links: [
      { title: "Flipper Zero UART guide", url: "https://docs.flipper.net/development/hardware/uart" },
    ],
  },
  "FTDI_USB": {
    wiring: "FTDI TX->Target RX, RX->Target TX, 3V3 (or 5V as required), GND",
    links: [
      { title: "FTDI VCP Drivers", url: "https://ftdichip.com/drivers/vcp-drivers/" },
    ],
  },
  "Raspberry Pi": {
    wiring: "GPIO14 (TXD)->Target RX, GPIO15 (RXD)->Target TX, 3V3, GND",
    links: [
      { title: "Enable UART on Pi", url: "https://www.raspberrypi.com/documentation/computers/configuration.html#serial-port" },
    ],
  },
};

type TargetDeviceKey =
  | "RTL8710BN"
  | "STM32F1xx"
  | "STM32F4xx"
  | "ESP8266"
  | "ESP32"
  | "ATmega328P"
  | "RP2040"
  | "GD32F103"
  | "nRF52840"
  | "CH32V003"
  | "PIC16F877A"
  | "AVR_Family"
  | "ARM_Cortex_Family"
  | "MSP430G2553"
  | "W25Q128"
  | "MX25L64"
  | "24LC256";

type TargetDevice = {
  name: string;
  pins: string;
  tips: string[];
  links: { title: string; url: string }[];
};

const targetHardware: Record<TargetDeviceKey, TargetDevice> = {
  RTL8710BN: {
    name: "Realtek RTL8710BN",
    pins: "UART Flashing: LOG_TXD (PA23) -> Programmer RX, LOG_RXD (PA22) -> Programmer TX. CH_EN (Reset) -> pull to GND to enter flash mode. Power with 3.3V.",
    tips: [
      "To enter flash mode, pull CH_EN (Chip Enable) to GND, then release while keeping TX pulled to GND.",
      "Use a 3.3V power supply. Do not use 5V.",
      "This is the chip used on the Flipper Zero Wi-Fi Dev Board.",
    ],
    links: [
      { title: "RTL8710BN Datasheet", url: "https://www.amebaiot.com/en/ameba-sdk-download/" },
    ],
  },
  STM32F1xx: {
    name: "STMicroelectronics STM32F1xx Series",
    pins: "SWD Interface: SWDIO on PA13, SWCLK on PA14. UART Bootloader: USART1 TX on PA9, RX on PA10.",
    tips: [
      "For SWD debugging, ensure NRST is connected.",
      "To use the built-in UART bootloader, pull BOOT0 to HIGH and BOOT1 to LOW, then reset the device.",
      "Commonly found on 'Blue Pill' development boards.",
    ],
    links: [
      { title: "STM32F103 (Blue Pill) Pinout", url: "https://stm32-base.org/assets/img/boards/STM32F103C8T6-Blue-Pill-pinout.svg" },
      { title: "RM0008 Reference Manual", url: "https://www.st.com/resource/en/reference_manual/cd00171190-stm32f101xx-stm32f102xx-stm32f103xx-stm32f105xx-and-stm32f107xx-advanced-arm-based-32-bit-mcus-stmicroelectronics.pdf" },
    ],
  },
  STM32F4xx: {
    name: "STMicroelectronics STM32F4xx Series",
    pins: "SWD Interface: SWDIO on PA13, SWCLK on PA14. UART Bootloader: USART1 TX on PA9/PB6, RX on PA10/PB7 (check datasheet).",
    tips: [
        "Similar to STM32F1xx, requires setting BOOT0/BOOT1 pins for bootloader mode.",
        "These are higher performance MCUs, often with more peripherals.",
        "Found on many Nucleo and Discovery boards."
    ],
    links: [
        { title: "AN2606: STM32 boot mode", url: "https://www.st.com/resource/en/application_note/cd00167594-stm32-microcontroller-system-memory-boot-mode-stmicroelectronics.pdf" },
    ]
  },
  ESP8266: {
    name: "Espressif ESP8266",
    pins: "UART Flashing: TX -> RX, RX -> TX. GPIO0 -> GND, GPIO2 -> HIGH (or floating), CH_PD (EN) -> HIGH.",
    tips: [
      "To enter flash mode, pull GPIO0 to GND, then reset the device (toggle RST or power cycle).",
      "Requires a 3.3V power supply. IO pins are not 5V tolerant.",
      "Use a good power supply; ESP8266 can have high peak current demands.",
    ],
    links: [
      { title: "ESP8266 Datasheet", url: "https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf" },
      { title: "NodeMCU (ESP-12E) Pinout", url: "https://randomnerdtutorials.com/getting-started-with-nodemcu-esp8266-on-windows/" },
    ],
  },
  ESP32: {
    name: "Espressif ESP32",
    pins: "UART Flashing: TXD0 -> RX, RXD0 -> TX. EN (Reset) and IO0 for boot mode.",
    tips: [
      "Most dev boards have auto-reset circuits. If not, pull IO0 to GND and toggle EN to enter flash mode.",
      "Dual-core MCU with Wi-Fi and Bluetooth.",
      "Many variants exist (S2, S3, C3); check the specific datasheet.",
    ],
    links: [
      { title: "ESP32-WROOM-32 Datasheet", url: "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf" },
      { title: "ESP32 Pinout Reference", url: "https://randomnerdtutorials.com/esp32-pinout-reference-gpios/" },
    ],
  },
  ATmega328P: {
    name: "Microchip ATmega328P",
    pins: "ISP Interface: MISO, MOSI, SCK, RESET, VCC, GND.",
    tips: [
      "The chip used in Arduino Uno.",
      "Can be programmed via ISP (In-System Programming) or via a bootloader over UART (TX/RX).",
      "Runs at 5V or 3.3V depending on clock speed.",
    ],
    links: [
      { title: "ATmega328P Datasheet", url: "https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf" },
      { title: "Arduino Uno Pinout", url: "https://docs.arduino.cc/hardware/uno-rev3/" },
    ],
  },
  RP2040: {
    name: "Raspberry Pi RP2040",
    pins: "SWD Interface: SWDIO, SWCLK. USB Bootloader: BOOTSEL button/pin.",
    tips: [
      "To enter USB bootloader mode, hold the BOOTSEL button while resetting or applying power.",
      "The device will appear as a USB Mass Storage device for drag-and-drop programming.",
      "Can also be programmed and debugged via SWD.",
    ],
    links: [
      { title: "RP2040 Datasheet", url: "https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf" },
      { title: "Raspberry Pi Pico Pinout", url: "https://datasheets.raspberrypi.com/pico/Pico-R3-A4-Pinout.pdf" },
    ],
  },
  GD32F103: {
    name: "GigaDevice GD32F103",
    pins: "SWD Interface: SWDIO on PA13, SWCLK on PA14. UART Bootloader: USART1 TX on PA9, RX on PA10.",
    tips: [
      "Often a pin-compatible clone of STM32F103.",
      "Bootloader sequence is the same as STM32 (BOOT0=HIGH, BOOT1=LOW).",
      "May require different programming tools or drivers than ST parts.",
    ],
    links: [
      { title: "GD32F103 Datasheet", url: "http://www.gd32mcu.com/en/download/0?kw=GD32F103" },
    ],
  },
  nRF52840: {
    name: "Nordic Semiconductor nRF52840",
    pins: "SWD Interface: SWDIO, SWCLK. Also supports NFC and USB for programming.",
    tips: [
      "Powerful MCU with Bluetooth 5, Thread, and Zigbee support.",
      "Often requires an external debugger like a J-Link or ST-Link flashed with J-Link firmware.",
      "Pay attention to power supply requirements and decoupling.",
    ],
    links: [
      { title: "nRF52840 Datasheet", url: "https://infocenter.nordicsemi.com/pdf/nRF52840_PS_v1.7.pdf" },
    ],
  },
  CH32V003: {
    name: "WCH CH32V003",
    pins: "Single Wire Debug (SWD-like): SWDIO on PC4.",
    tips: [
      "Ultra-low-cost 32-bit RISC-V microcontroller.",
      "Requires a WCH-LinkE programmer for debugging/flashing.",
      "Can be programmed via UART with a bootloader.",
    ],
    links: [
      { title: "CH32V003 Datasheet", url: "https://www.wch-ic.com/products/CH32V003.html" },
    ],
  },
  PIC16F877A: {
    name: "Microchip PIC16F877A",
    pins: "ICSP (In-Circuit Serial Programming): PGD, PGC, VPP/MCLR, VDD, VSS.",
    tips: [
      "A classic 8-bit microcontroller. Requires a PIC programmer like PICkit or ICD.",
      "Programming voltage (VPP) is higher than VDD, typically ~13V.",
      "Be careful with configuration bits (fuses) as they can 'brick' the device if set incorrectly.",
    ],
    links: [
      { title: "PIC16F877A Datasheet", url: "https://ww1.microchip.com/downloads/en/devicedoc/39582c.pdf" },
    ],
  },
  AVR_Family: {
    name: "Microchip AVR Family",
    pins: "Typically uses ISP (MISO, MOSI, SCK, RESET) or high-voltage programming.",
    tips: [
      "This is a broad family of 8-bit MCUs (includes ATmega, ATtiny).",
      "Select a specific device (like ATmega328P) for detailed pinouts.",
      "Fuses control clock source, reset behavior, etc. Be careful when changing them.",
    ],
    links: [
      { title: "AVR Libc Reference", url: "https://www.nongnu.org/avr-libc/" },
    ],
  },
  ARM_Cortex_Family: {
    name: "ARM Cortex-M Family",
    pins: "Typically uses SWD (SWDIO, SWCLK) or JTAG for debugging and programming.",
    tips: [
      "This is a family of 32-bit cores, not a specific chip.",
      "Select a specific MCU vendor and part (e.g., STM32, nRF52, RP2040).",
      "Debuggers like ST-Link, J-Link, or CMSIS-DAP are commonly used.",
    ],
    links: [
      { title: "ARM Cortex-M Overview", url: "https://developer.arm.com/Processors/Cortex-M" },
    ],
  },
  MSP430G2553: {
    name: "Texas Instruments MSP430G2553",
    pins: "Spy-Bi-Wire (2-wire JTAG): SBWTDIO (RST pin), SBWTCK (TEST pin).",
    tips: [
      "Ultra-low-power 16-bit MCU.",
      "Part of the TI LaunchPad ecosystem.",
      "Spy-Bi-Wire is sensitive to long wires and capacitance; keep connections short.",
    ],
    links: [
      { title: "MSP430G2553 Datasheet", url: "https://www.ti.com/lit/ds/symlink/msp430g2553.pdf" },
    ],
  },
  W25Q128: {
    name: "Winbond W25Q128 (128Mbit SPI Flash)",
    pins: "SPI Interface: CS, DO (MISO), WP, GND, VCC, HOLD, CLK, DI (MOSI).",
    tips: [
      "Commonly used for storing firmware or data for MCUs like ESP32/ESP8266.",
      "Can be read/written with most programmers that support SPI (BusPirate, FT232H, etc.).",
      "Ensure the logic level (e.g., 3.3V) matches your programmer.",
    ],
    links: [
      { title: "W25Q128JV Datasheet", url: "https://www.winbond.com/resource-files/w25q128jv%20revf%2003252019%20plus.pdf" },
    ],
  },
  MX25L64: {
    name: "Macronix MX25L64 (64Mbit SPI Flash)",
    pins: "SPI Interface: CS, SO, WP, GND, VCC, HOLD, SCLK, SI.",
    tips: [
      "Another popular SPI flash memory chip.",
      "Connect HOLD and WP pins to VCC if they are not being used.",
      "The exact part number (e.g., MX25L6406E) determines voltage and speed characteristics.",
    ],
    links: [
      { title: "MX25L6406E Datasheet", url: "https://www.macronix.com/Lists/Datasheet/Attachments/737/MX25L6406E,%203V,%2064Mb,%20v1.9.pdf" },
    ],
  },
  "24LC256": {
    name: "Microchip 24LC256 (256Kbit I2C EEPROM)",
    pins: "I2C Interface: SDA, SCL. Address pins: A0, A1, A2.",
    tips: [
      "Serial EEPROM for storing configuration or small amounts of data.",
      "Requires pull-up resistors on SDA and SCL lines (typically 2.2k-10k ohms).",
      "The hardware address is set by pulling the A0/A1/A2 pins to VCC or GND.",
    ],
    links: [
      { title: "24LC256 Datasheet", url: "https://ww1.microchip.com/downloads/en/devicedoc/21203m.pdf" },
    ],
  },
};

function toHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const hex = Array.from(slice).map(b => b.toString(16).padStart(2, "0")).join(" ");
    lines.push(hex);
  }
  return lines.join("\n");
}

function toIntelHex(bytes: Uint8Array, baseAddr = 0): string {
  const recs: string[] = [];
  let addr = baseAddr;
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const len = slice.length;
    const hi = (addr >> 8) & 0xff;
    const lo = addr & 0xff;
    let sum = len + hi + lo + 0x00;
    const data = Array.from(slice);
    sum += data.reduce((a, b) => a + b, 0);
    const cks = ((~sum + 1) & 0xff).toString(16).padStart(2, "0");
    const dataHex = data.map(b => b.toString(16).padStart(2, "0")).join("");
    recs.push(`:${len.toString(16).padStart(2, "0")}${hi.toString(16).padStart(2, "0")}${lo
      .toString(16)
      .padStart(2, "0")}00${dataHex}${cks}`.toUpperCase());
    addr += len;
  }
  recs.push(":00000001FF");
  return recs.join("\n");
}

function toSrec(bytes: Uint8Array, baseAddr = 0): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const addr = baseAddr + i;
    const addrBytes = [
      (addr >> 24) & 0xff,
      (addr >> 16) & 0xff,
      (addr >> 8) & 0xff,
      addr & 0xff,
    ];
    const data = [...addrBytes, ...Array.from(slice)];
    const count = data.length + 1;
    const sum = data.reduce((a, b) => a + b, count) & 0xff;
    const cks = (~sum) & 0xff;
    const body = data.map(b => b.toString(16).padStart(2, "0")).join("");
    lines.push(`S3${count.toString(16).padStart(2, "0").toUpperCase()}${body.toUpperCase()}${cks
      .toString(16)
      .padStart(2, "0")}`);
  }
  lines.push("S70500000000FA");
  return lines.join("\n");
}

function downloadBlob(name: string, mime: string, data: BlobPart) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [format, setFormat] = useState<DumpFormat>("BIN");
  const [address, setAddress] = useState("0x8000000");
  const [length, setLength] = useState(256);
  const [log, setLog] = useState<string[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [device, setDevice] = useState<Device>("Flipper Zero");
  const [target, setTarget] = useState<TargetDeviceKey>("RTL8710BN");

  const connect = async () => {
    setConnected(true);
    setLog(l => [...l, "[Mock] Connected."]);
  };

  const dump = async (): Promise<Uint8Array> => {
    const len = Number(length) | 0;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 0x5a) & 0xff;
    setLog(l => [...l, `[Mock] Dumped ${len} bytes from ${address}.`]);
    return bytes;
  };

  const handleDownload = async () => {
    const base = parseInt(address, 16) || 0;
    const data = await dump();
    switch (format) {
      case "BIN":
        downloadBlob(`dump_${address}.bin`, "application/octet-stream", data);
        break;
      case "Intel HEX":
        downloadBlob(`dump_${address}.hex`, "text/plain", toIntelHex(data, base));
        break;
      case "Motorola S-Record":
        downloadBlob(`dump_${address}.srec`, "text/plain", toSrec(data, base));
        break;
      case "ASCII/Text":
        downloadBlob(`dump_${address}.txt`, "text/plain", toHexDump(data));
        break;
    }
    setLog(l => [...l, `[OK] Downloaded dump as ${format}.`] );
  };

  const programmerInfo = deviceDrivers[device];
  const targetInfo = targetHardware[target];
  const allLinks = useMemo(() => {
    const links = new Map<string, { title: string; url: string }>();
    programmerInfo.links.forEach(l => links.set(l.url, l));
    targetInfo.links.forEach(l => links.set(l.url, l));
    return Array.from(links.values());
  }, [programmerInfo, targetInfo]);


  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 16, maxWidth: 800, margin: "auto" }}>
      <h2>Flipper Zero Wi-Fi Dev Board RTL8710BN Flasher</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={connected ? undefined : connect} disabled={connected} aria-label="Connect to serial port">
          {connected ? "Connected" : "Connect"}
        </button>
        <label>Address: <input value={address} onChange={e => setAddress(e.target.value)} aria-label="Address:" /></label>
        <label>Length: <input type="number" value={length} onChange={e => setLength(parseInt(e.target.value || "0", 10))} aria-label="Length:" /></label>
        <label>Dump-Format:
          <select value={format} onChange={e => setFormat(e.target.value as DumpFormat)} aria-label="Dump format">
            {formatOptions.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <button onClick={handleDownload} disabled={!connected}>Dump & Download</button>
        <button onClick={() => setShowSetup(true)}>Dump-Setup</button>
      </div>

      {showSetup && (
        <div role="dialog" aria-modal="true" style={{ marginTop: 12, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Dump-Setup</h3>
            <button onClick={() => setShowSetup(false)} aria-label="Close setup" style={{height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>×</button>
          </div>
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8}}>
            <label>Geräteauswahl (Programmer):&nbsp;
              <select value={device} onChange={e => setDevice(e.target.value as Device)} aria-label="Geräteauswahl (Programmer)">
                {Object.keys(deviceDrivers).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>Ziel-Hardware (Target):&nbsp;
              <select value={target} onChange={e => setTarget(e.target.value as TargetDeviceKey)} aria-label="Ziel-Hardware (Target)">
                {Object.keys(targetHardware).map(t => (
                  <option key={t} value={t}>{targetHardware[t as TargetDeviceKey].name}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong>Verkabelung (Wiring)</strong>
            <div aria-label="Wiring diagram" style={{ padding: 8, background: "#fafafa", border: "1px dashed #bbb", borderRadius: 6, fontSize: "0.9em" }}>
                <p style={{margin: '4px 0'}}><strong>Programmer ({device}):</strong> {programmerInfo.wiring}</p>
                <p style={{margin: '4px 0'}}><strong>Target ({targetInfo.name}):</strong> {targetInfo.pins}</p>
            </div>
          </div>
          {targetInfo.tips.length > 0 && (
            <div style={{ marginTop: 12 }}>
                <strong>Spezifische Hinweise & Tipps</strong>
                <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: '0.9em' }}>
                    {targetInfo.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                </ul>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <strong>Treiber, Datenblätter & Links</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: '0.9em' }}>
              {allLinks.map(l => (
                <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a> ({l.url.includes("st.com") || l.url.includes("github.com/stlink-org") ? device : targetInfo.name})</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>Log</strong>
        <div aria-live="polite" aria-relevant="additions text" style={{ whiteSpace: "pre-wrap", minHeight: 80, padding: 8, border: "1px solid #eee", background: '#f8f8f8', fontFamily: 'monospace' }}>
          {log.join("\n")}
        </div>
      </div>
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
