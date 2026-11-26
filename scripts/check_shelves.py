import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()
c.execute("SELECT id, code, zone, plant FROM shelves WHERE code LIKE '%PB3%' OR code LIKE '%PB-3%' OR code LIKE '%ACE%'")
for r in c.fetchall():
    print(r)
conn.close()
