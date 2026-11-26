import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
for t in tables:
    c.execute(f"PRAGMA table_info({t})")
    cols = [col[1] for col in c.fetchall()]
    for col in cols:
        try:
            c.execute(f"SELECT count(*) FROM {t} WHERE {col} LIKE '%PB3-01%'")
            cnt = c.fetchone()[0]
            if cnt > 0:
                print(f"{t}.{col} has {cnt} occurrences of PB3-01")
        except:
            pass
conn.close()
