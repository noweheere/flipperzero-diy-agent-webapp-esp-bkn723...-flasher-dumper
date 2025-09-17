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
    wiring: "ST-Link SWDIO->PA13, SWCLK->PA14, 3V3, GND",
    links: [
      { title: "ST-Link Utility (Windows)", url: "https://www.st.com/en/development-tools/stsw-link004.html" },
      { title: "stlink (Linux/macOS)", url: "https://github.com/stlink-org/stlink" },
    ],
  },
  "BusPirate v3.6": {
    wiring: "MOSI->TXD, MISO->RXD, CLK->SCK, CS->CS, 3V3, GND",
    links: [
      { title: "Bus Pirate docs", url: "http://dangerousprototypes.com/docs/Bus_Pirate" },
    ],
  },
  "Flipper Zero": {
    wiring: "Flipper UART TX->RX, RX->TX, 3V3, GND (DevBoard UART0)",
    links: [
      { title: "Flipper Zero UART guide", url: "https://docs.flipper.net/development/hardware/uart" },
    ],
  },
  "FTDI_USB": {
    wiring: "FTDI TX->RX, RX->TX, 3V3 (or 5V as required), GND",
    links: [
      { title: "FTDI VCP Drivers", url: "https://ftdichip.com/drivers/vcp-drivers/" },
    ],
  },
  "Raspberry Pi": {
    wiring: "GPIO14 (TXD)->RX, GPIO15 (RXD)->TX, 3V3, GND",
    links: [
      { title: "Enable UART on Pi", url: "https://www.raspberrypi.com/documentation/computers/configuration.html#serial-port" },
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
  // Simplified IHEX writer: 16-byte records
  const recs: string[] = [];
  let addr = baseAddr;
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const len = slice.length;
    const hi = (addr >> 8) & 0xff;
    const lo = addr & 0xff;
    let sum = len + hi + lo + 0x00; // data record
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
    const count = data.length + 1; // + checksum
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

  // Mock serial connect for preview
  const connect = async () => {
    setConnected(true);
    setLog(l => [...l, "[Mock] Connected."]);
  };

  const dump = async (): Promise<Uint8Array> => {
    // Mock some bytes to simulate dump
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

  const wiring = deviceDrivers[device];

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 16 }}>
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
            <strong>Dump-Setup</strong>
            <button onClick={() => setShowSetup(false)} aria-label="Close setup">×</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>Geräteauswahl:&nbsp;
              <select value={device} onChange={e => setDevice(e.target.value as Device)} aria-label="Geräteauswahl">
                {Object.keys(deviceDrivers).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong>Wiring Diagram</strong>
            <div aria-label="Wiring diagram" style={{ padding: 8, background: "#fafafa", border: "1px dashed #bbb", borderRadius: 6 }}>
              {wiring.wiring}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong>Treiber/Konfiguration</strong>
            <ul>
              {wiring.links.map(l => (
                <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>Log</strong>
        <div aria-live="polite" aria-relevant="additions text" style={{ whiteSpace: "pre-wrap", minHeight: 80, padding: 8, border: "1px solid #eee" }}>
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
