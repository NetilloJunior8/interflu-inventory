import sqlite3
from datetime import datetime

def check_and_fix():
    conn = sqlite3.connect('backend/interflu_inventory.db')
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in c.fetchall()]
    
    print("Tables found:", tables)
    for t in tables:
        if t.startswith('sqlite_'): 
            continue
        c.execute(f"PRAGMA table_info({t})")
        cols = c.fetchall()
        for col in cols:
            col_name = col[1]
            col_type = col[2]
            if 'time' in col_name.lower() or 'date' in col_name.lower() or col_name.endswith('_at'):
                c.execute(f"SELECT DISTINCT typeof({col_name}) FROM {t}")
                types = [r[0] for r in c.fetchall()]
                print(f"Table {t}.{col_name} ({col_type}): types present = {types}")
                
                # Check if there are 'text' values
                if 'text' in types:
                    print(f"  Fixing text values in {t}.{col_name}...")
                    c.execute(f"SELECT id, {col_name} FROM {t} WHERE typeof({col_name}) = 'text'")
                    rows = c.fetchall()
                    for rid, val in rows:
                        # Parse text datetime into epoch millis
                        # Format might be '2026-11-25 07:55:49.882' or similar
                        try:
                            # Try standard formats
                            dt = None
                            for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
                                try:
                                    dt = datetime.strptime(val, fmt)
                                    break
                                except ValueError:
                                    pass
                            if dt:
                                epoch_ms = int(dt.timestamp() * 1000)
                                c.execute(f"UPDATE {t} SET {col_name} = ? WHERE id = ?", (epoch_ms, rid))
                            else:
                                print(f"    Could not parse date: {val} for id {rid}")
                        except Exception as e:
                            print(f"    Error fixing {rid}: {e}")
                    conn.commit()
                    print(f"  Fixed {len(rows)} rows in {t}.{col_name}")

    conn.close()

if __name__ == '__main__':
    check_and_fix()
