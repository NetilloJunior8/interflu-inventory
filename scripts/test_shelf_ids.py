import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()
c.execute("SELECT id, code FROM shelves WHERE code LIKE '%ACE%' ORDER BY id")
print("Shelves ACE:", c.fetchall())

c.execute("SELECT shelf_id, count(*), sum(quantity) FROM count_records GROUP BY shelf_id")
print("Counts by shelf_id in count_records:", c.fetchall())

c.execute("SELECT id, shelf_id, status FROM shelf_assignments WHERE session_id=1 AND shelf_id <= 20")
print("Assignments:", c.fetchall())
conn.close()
