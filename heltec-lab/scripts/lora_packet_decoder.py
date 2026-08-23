#!/usr/bin/env python3
"""
=============================================================================
Heltec LoRa Packet Structure & AES-128 Decryptor Script
=============================================================================
Author: Antigravity AI
Description:
  Demonstrates parsing custom P2P binary radio packets and decrypting
  payloads encrypted with AES-128 symmetric keys.

Requirements:
  pip install cryptography
=============================================================================
"""

import sys
import struct

# Force UTF-8 output encoding for Windows terminals
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

# Default 16-byte Secret AES Key (must match transmitter code!)
AES_KEY = b"HeltecSecretKey1"  # 16 bytes key
AES_IV  = b"HeltecInitVec123"  # 16 bytes IV

def parse_lora_packet(packet_bytes):
    """
    Parses a standard binary packet frame:
    [0:2]   Header Magic (0x48, 0x4C -> 'HL')
    [2]     Sender Node ID
    [3]     Receiver Node ID
    [4]     Sequence Number
    [5]     Flags (0x01 = Encrypted)
    [6:]    Payload bytes
    """
    if len(packet_bytes) < 6:
        return {"error": "Packet too short"}

    magic, sender_id, rx_id, seq_num, flags = struct.unpack(">2sBBBB", packet_bytes[:6])

    if magic != b"HL":
        return {"error": f"Invalid packet magic: {magic}"}

    is_encrypted = bool(flags & 0x01)
    raw_payload = packet_bytes[6:]

    result = {
        "sender_id": sender_id,
        "receiver_id": rx_id,
        "sequence_number": seq_num,
        "encrypted": is_encrypted,
        "raw_payload_hex": raw_payload.hex()
    }

    if is_encrypted and HAS_CRYPTO:
        try:
            cipher = Cipher(algorithms.AES(AES_KEY), modes.CBC(AES_IV), backend=default_backend())
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(raw_payload) + decryptor.finalize()
            # Remove PKCS7 padding
            pad_len = decrypted[-1]
            plaintext = decrypted[:-pad_len].decode('utf-8', errors='replace')
            result["decrypted_message"] = plaintext
        except Exception as e:
            result["decrypted_message"] = f"Decryption Failed ({e})"
    else:
        result["message"] = raw_payload.decode('utf-8', errors='replace')

    return result

def main():
    print("=====================================================")
    print(" 🔓 Heltec LoRa Packet Decoder & AES Decryptor")
    print("=====================================================\n")

    if not HAS_CRYPTO:
        print("⚠️  Note: 'cryptography' module not installed. Running in plaintext mode.")
        print("   To enable AES-128 decryption, run: pip install cryptography\n")

    # Sample Plaintext Packet Frame
    plain_frame = b"HL" + bytes([0x01, 0x02, 0x2A, 0x00]) + b"Hello from Heltec Node 1!"
    print("📦 Sample Packet 1 (Plaintext):")
    print(f"   Hex Raw: {plain_frame.hex()}")
    parsed1 = parse_lora_packet(plain_frame)
    print(f"   Parsed : {parsed1}\n")

    # Sample Encrypted Packet Frame (using AES-128)
    if HAS_CRYPTO:
        msg = b"TOP SECRET LORA MESSAGE!"
        pad_len = 16 - (len(msg) % 16)
        msg_padded = msg + bytes([pad_len] * pad_len)

        try:
            cipher = Cipher(algorithms.AES(AES_KEY), modes.CBC(AES_IV), backend=default_backend())
            encryptor = cipher.encryptor()
            encrypted_payload = encryptor.update(msg_padded) + encryptor.finalize()

            enc_frame = b"HL" + bytes([0x05, 0xFF, 0x64, 0x01]) + encrypted_payload
            print("🔒 Sample Packet 2 (AES-128 Encrypted):")
            print(f"   Hex Raw: {enc_frame.hex()}")
            parsed2 = parse_lora_packet(enc_frame)
            print(f"   Parsed : {parsed2}\n")
        except Exception as e:
            print(f"AES encryption test skipped: {e}")

if __name__ == "__main__":
    main()
