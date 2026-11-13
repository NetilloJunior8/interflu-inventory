import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute("SELECT code, zone, active FROM shelves WHERE plant = 'Planta Alta' ORDER BY code")
rows = c.fetchall()
print(f"Total Planta Alta shelves: {len(rows)}")
zones = {}
for code, zone, active in rows:
    zones[zone] = zones.get(zone, 0) + 1
print("Zones breakdown in Planta Alta:")
for z, cnt in sorted(zones.items()):
    print(f"  {z}: {cnt}")

conn.close()
