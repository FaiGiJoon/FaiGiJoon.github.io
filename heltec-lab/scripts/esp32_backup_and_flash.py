#!/usr/bin/env python3
"""
=============================================================================
Heltec ESP32 Board Information, Backup & Flashing Utility
=============================================================================
Author: Antigravity AI
Description:
  Reads ESP32 chip details (MAC address, Flash size, Revision), dumps complete
  factory flash backup to a .bin file for safe recovery, and flashes new firmware.

Requirements:
  pip install esptool pyserial
=============================================================================
"""

import sys
import subprocess
import time
from pathlib import Path

# Force UTF-8 output encoding for Windows terminals
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run_esptool(args):
    """Executes esptool via python module."""
    cmd = [sys.executable, "-m", "esptool"] + args
    print(f"Executing: {' '.join(cmd)}\n")
    try:
        res = subprocess.run(cmd, capture_output=False, text=True)
        return res.returncode == 0
    except Exception as e:
        print(f"❌ Failed to run esptool: {e}")
        return False

def main():
    print("=====================================================")
    print(" 🛠️  Heltec ESP32 Backup & Flashing Utility")
    print("=====================================================")
    print("1. Read Chip Info & MAC Address")
    print("2. Backup Factory Flash Memory (Full 8MB Dump)")
    print("3. Erase Flash (Reset Board)")
    print("4. Exit")
    print("=====================================================")

    choice = input("Select an option (1-4): ").strip()

    if choice == "1":
        print("\n🔍 Querying ESP32 chip info...")
        run_esptool(["flash_id"])

    elif choice == "2":
        backup_filename = f"heltec_factory_backup_{int(time.time())}.bin"
        print(f"\n💾 Dumping full 8MB flash to '{backup_filename}'...")
        print("💡 Keep your board connected via USB during backup (takes ~30 seconds).\n")

        success = run_esptool(["read_flash", "0x0", "0x800000", backup_filename])
        if success:
            print(f"\n🎉 BACKUP SUCCESSFUL! File saved to: {Path(backup_filename).resolve()}")
        else:
            print("\n❌ Flash backup failed. Check USB cable connection.")

    elif choice == "3":
        confirm = input("\n⚠️ WARNING: Erase entire flash? (y/N): ").strip().lower()
        if confirm == "y":
            run_esptool(["erase_flash"])
        else:
            print("Cancelled.")

    elif choice == "4":
        print("Goodbye!")

if __name__ == "__main__":
    main()
