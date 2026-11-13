import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute("SELECT sa.id, sa.session_id, s.code FROM shelf_assignments sa JOIN shelves s ON sa.shelf_id = s.id WHERE s.code LIKE 'PB-CHID-W%'")
rows = c.fetchall()
print(f"Total PB-CHID-W assignments: {len(rows)}")
for r in rows:
    print(r)

c.execute("SELECT id, folio FROM inventory_sessions")
sessions = c.fetchall()
print(f"Total sessions: {len(sessions)}")
for s in sessions:
    print(s)

conn.close()
