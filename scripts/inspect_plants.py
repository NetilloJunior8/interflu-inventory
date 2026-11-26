import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

pb_rows = c.execute("SELECT id, code, zone, description FROM shelves WHERE plant = 'Planta Baja' ORDER BY code").fetchall()
print(f"Total Planta Baja shelves in DB: {len(pb_rows)}")

by_zone = {}
for r in pb_rows:
    by_zone.setdefault(r[2], []).append(r[1])

for z, codes in sorted(by_zone.items()):
    print(f"  Zone '{z}' ({len(codes)}): {codes}")

pa_rows = c.execute("SELECT id, code, zone, description FROM shelves WHERE plant = 'Planta Alta' ORDER BY code").fetchall()
print(f"\nTotal Planta Alta shelves in DB: {len(pa_rows)}")

conn.close()
