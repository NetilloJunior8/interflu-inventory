import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute("SELECT code, zone, posx, posy, width, height, active FROM shelves WHERE plant = 'Planta Baja' ORDER BY code")
rows = c.fetchall()
print(f"Total Planta Baja shelves in DB: {len(rows)}")
for r in rows:
    print(r)

conn.close()
