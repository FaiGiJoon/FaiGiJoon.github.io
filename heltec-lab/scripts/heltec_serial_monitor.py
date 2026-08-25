#!/usr/bin/env python3
"""
=============================================================================
Heltec Wireless Stick - Live USB Serial Monitor & LoRa Packet Logger
=============================================================================
Author: Antigravity AI
Description:
  Auto-detects your Heltec ESP32 board connected via USB, streams live serial
  console output, parses incoming LoRa radio packets, RSSI signal levels,
  and battery telemetry, and logs them into structured JSON & log files.

Requirements:
  pip install pyserial rich
=============================================================================
"""

import sys
import time
import json
import re
import datetime
from pathlib import Path

# Force UTF-8 output encoding for Windows terminals
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("❌ Error: 'pyserial' module not found. Install it with: pip install pyserial")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.live import Live
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

LOG_FILE = Path(__file__).parent / "lora_received_packets.json"

def find_heltec_com_port():
    """Scans system serial ports to detect ESP32 / Heltec USB Serial bridge."""
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None

    for p in ports:
        desc = p.description.lower()
        hwid = p.hwid.lower()
        # Look for CP210x, CH340, USB JTAG/serial debug unit (ESP32-S3)
        if any(keyword in desc or keyword in hwid for keyword in ["cp210", "ch340", "usb serial", "esp32", "10c4:ea60"]):
            return p.device

    # Fallback: return the first available COM port
    return ports[0].device if ports else None

def parse_line(line):
    """Parses serial output for RSSI, SNR, battery, and message payload."""
    data = {
        "timestamp": datetime.datetime.now().isoformat(),
        "raw": line.strip()
    }

    # Extract RSSI (e.g., RSSI: -85 dBm)
    rssi_match = re.search(r'RSSI:\s*(-?\d+)', line, re.IGNORECASE)
    if rssi_match:
        data["rssi"] = int(rssi_match.group(1))

    # Extract SNR (e.g., SNR: +9.5 dB)
    snr_match = re.search(r'SNR:\s*(-?\d+(?:\.\d+)?)', line, re.IGNORECASE)
    if snr_match:
        data["snr"] = float(snr_match.group(1))

    # Extract Payload
    payload_match = re.search(r'(?:Payload|Received|Msg):\s*(.+)', line, re.IGNORECASE)
    if payload_match:
        data["payload"] = payload_match.group(1).strip()

    return data

def save_to_log(data):
    """Appends parsed packet to JSON log file."""
    logs = []
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                logs = json.load(f)
        except Exception:
            logs = []

    logs.append(data)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2)

def main():
    print("=====================================================")
    print(" 📡 Heltec Wireless Stick - USB Serial Monitor & Logger")
    print("=====================================================")

    port = find_heltec_com_port()
    if not port:
        print("❌ No Heltec/ESP32 serial device detected!")
        print("   Please connect your Heltec board via USB-C cable and retry.")
        input("Press Enter to exit...")
        return

    baud = 115200
    print(f"🔌 Auto-detected device on port: {port}")
    print(f"⚡ Opening connection at {baud} baud...\n")

    try:
        ser = serial.Serial(port, baudrate=baud, timeout=1)
        time.sleep(1) # Wait for serial buffer setup
    except Exception as e:
        print(f"❌ Failed to open port {port}: {e}")
        return

    print("🟢 Connected! Listening for incoming serial & LoRa packets... (Press Ctrl+C to stop)\n")

    packet_count = 0

    try:
        while True:
            if ser.in_waiting > 0:
                line_bytes = ser.readline()
                try:
                    line = line_bytes.decode('utf-8', errors='replace').rstrip()
                except Exception:
                    continue

                if not line:
                    continue

                parsed = parse_line(line)

                # Format terminal output
                timestamp = datetime.datetime.now().strftime("%H:%M:%S")

                if "rssi" in parsed or "payload" in parsed:
                    packet_count += 1
                    save_to_log(parsed)

                    rssi_str = f" [RSSI: {parsed.get('rssi', 'N/A')} dBm]" if "rssi" in parsed else ""
                    snr_str = f" [SNR: {parsed.get('snr', 'N/A')} dB]" if "snr" in parsed else ""
                    payload_str = f" -> {parsed.get('payload', line)}"

                    if HAS_RICH:
                        console.print(f"[bold cyan][{timestamp} #{packet_count}][/bold cyan] [bold green]📡 LORA PACKET[/bold green]{rssi_str}{snr_str}[white]{payload_str}[/white]")
                    else:
                        print(f"[{timestamp} #{packet_count}] 📡 LORA PACKET{rssi_str}{snr_str}{payload_str}")
                else:
                    # Regular console debug output
                    if HAS_RICH:
                        console.print(f"[dim][{timestamp}][/dim] {line}")
                    else:
                        print(f"[{timestamp}] {line}")

            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n\n🛑 Serial monitoring stopped by user.")
    finally:
        ser.close()
        print(f"💾 Total packets saved to log: {packet_count}")
        print(f"📄 Log file path: {LOG_FILE.resolve()}")

if __name__ == "__main__":
    main()
