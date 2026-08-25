#!/usr/bin/env python3
"""Read the built .exe's PE headers and prove three things a school depends on.

Written because all three are the kind of claim that is easy to make from the
build flags and wrong in the binary:

  1. THE CRT IS STATIC. `+crt-static` lives in .cargo/config.toml, which cargo
     resolves by CURRENT WORKING DIRECTORY — build from the wrong folder and the
     flag is silently dropped. The exe then needs the VC++ redistributable, and
     fails on the locked-down PCs least able to install it, with a dialog that
     names a DLL rather than the app.
  2. THE SUBSYSTEM IS GUI. A console subsystem exe flashes a black window on
     every launch.
  3. IT IS 64-BIT x86, i.e. the thing we meant to build.

Usage:  python3 scripts/check-static-crt.py path/to/MonospaceTimetable.exe
Exit code 0 if all three hold, 1 otherwise.
"""

import struct
import sys

# Importing any of these means the CRT is linked dynamically.
DYNAMIC_CRT = ("vcruntime", "msvcp", "msvcr", "api-ms-win-crt", "ucrtbase")

SUBSYSTEMS = {2: "Windows GUI", 3: "Windows console"}
MACHINES = {0x8664: "x86-64", 0x14C: "x86", 0xAA64: "ARM64"}


def rva_to_offset(rva, sections):
    for va, vsize, raw_ptr, raw_size in sections:
        if va <= rva < va + max(vsize, raw_size):
            return raw_ptr + (rva - va)
    return None


def cstring(data, offset):
    end = data.index(b"\0", offset)
    return data[offset:end].decode("ascii", "replace")


def read_pe(path):
    with open(path, "rb") as handle:
        data = handle.read()

    if data[:2] != b"MZ":
        raise SystemExit(f"{path} is not a PE file (no MZ header)")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe : pe + 4] != b"PE\0\0":
        raise SystemExit(f"{path} has no PE signature")

    machine, section_count = struct.unpack_from("<HH", data, pe + 4)
    opt_size = struct.unpack_from("<H", data, pe + 20)[0]
    opt = pe + 24
    magic = struct.unpack_from("<H", data, opt)[0]
    if magic != 0x20B:
        raise SystemExit("expected a PE32+ (64-bit) image")

    subsystem = struct.unpack_from("<H", data, opt + 68)[0]
    dir_count = struct.unpack_from("<I", data, opt + 108)[0]
    import_rva, _ = struct.unpack_from("<II", data, opt + 112 + 8) if dir_count > 1 else (0, 0)

    sections = []
    table = opt + opt_size
    for i in range(section_count):
        base = table + i * 40
        vsize, va, raw_size, raw_ptr = struct.unpack_from("<IIII", data, base + 8)
        sections.append((va, vsize, raw_ptr, raw_size))

    imports = []
    if import_rva:
        offset = rva_to_offset(import_rva, sections)
        while offset is not None:
            descriptor = data[offset : offset + 20]
            if len(descriptor) < 20 or descriptor == b"\0" * 20:
                break
            name_rva = struct.unpack_from("<I", descriptor, 12)[0]
            if not name_rva:
                break
            name_offset = rva_to_offset(name_rva, sections)
            if name_offset is None:
                break
            imports.append(cstring(data, name_offset))
            offset += 20

    return {
        "bytes": len(data),
        "machine": machine,
        "subsystem": subsystem,
        "imports": sorted(set(imports), key=str.lower),
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    path = sys.argv[1]
    pe = read_pe(path)

    print(f"{path}")
    print(f"  size        {pe['bytes']:,} bytes ({pe['bytes'] / 1_048_576:.2f} MB)")
    print(f"  machine     {MACHINES.get(pe['machine'], hex(pe['machine']))}")
    print(f"  subsystem   {SUBSYSTEMS.get(pe['subsystem'], pe['subsystem'])}")
    print(f"  imports     {len(pe['imports'])} DLLs")
    for dll in pe["imports"]:
        print(f"                {dll}")

    failures = []
    dynamic = [d for d in pe["imports"] if any(m in d.lower() for m in DYNAMIC_CRT)]
    if dynamic:
        failures.append(
            "the CRT is DYNAMIC — this exe needs the VC++ redistributable installed. "
            f"Offending imports: {', '.join(dynamic)}. Build from apps/shell/ so "
            ".cargo/config.toml is picked up."
        )
    if pe["subsystem"] != 2:
        failures.append(
            f"subsystem is {SUBSYSTEMS.get(pe['subsystem'], pe['subsystem'])}, not Windows GUI — "
            "a console window will flash on launch."
        )
    if pe["machine"] != 0x8664:
        failures.append(f"machine is {MACHINES.get(pe['machine'], hex(pe['machine']))}, not x86-64.")

    print()
    if failures:
        for f in failures:
            print(f"  FAIL  {f}")
        return 1
    print("  PASS  static CRT, Windows GUI subsystem, x86-64.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
