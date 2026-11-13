import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

print("=== PLANTA BAJA SHELVES ANALYSIS ===")
c.execute("""
    SELECT zone, COUNT(*), GROUP_CONCAT(code, ', ')
    FROM shelves
    WHERE plant = 'Planta Baja' AND active = 1
    GROUP BY zone
    ORDER BY zone
""")
pb_zones = c.fetchall()
pb_total = 0
for z, cnt, codes in pb_zones:
    pb_total += cnt
    print(f"[{z}] ({cnt} anaqueles): {codes}\n")
print(f"Total Planta Baja: {pb_total} (Blueprint target: 87)")

print("\n=== PLANTA ALTA SHELVES ANALYSIS ===")
c.execute("""
    SELECT zone, COUNT(*), GROUP_CONCAT(code, ', ')
    FROM shelves
    WHERE plant = 'Planta Alta' AND active = 1
    GROUP BY zone
    ORDER BY zone
""")
pa_zones = c.fetchall()
pa_total = 0
for z, cnt, codes in pa_zones:
    pa_total += cnt
    print(f"[{z}] ({cnt} anaqueles): {codes}\n")
print(f"Total Planta Alta: {pa_total} (Blueprint target: 84)")

print(f"\nTOTAL PHYSICAL SHELVES: {pb_total + pa_total} (Target: 171)")

conn.close()
