#!/usr/bin/env python3
"""Validate original source screen counts, route IDs and six-workstream coverage.

Does not validate implementation; Cursor must also add runtime/Playwright checks.
"""
import json
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
REG=ROOT/'07_ORIGINAL_SPECIFICATIONS'/'Arlovi_Complete_UX_Screen_Registry.json'
OWN=ROOT/'06_MACHINE_READABLE'/'workstream_assignment.json'
reg=json.loads(REG.read_text(encoding='utf-8'))
assign=json.loads(OWN.read_text(encoding='utf-8'))
apps=reg['applications'];pages=[(a,p) for a in apps for p in a['pages']]
ids=[p['id'] for _,p in pages]
routes=[p['route'] for _,p in pages]
assert len(apps)==35 and len(pages)==316, (len(apps),len(pages))
assert len(ids)==len(set(ids)),'Duplicate IDs'
assert len(routes)==len(set(routes)),'Duplicate routes'
assert sum(len(p['tabs']) for _,p in pages)==1323
assert sum(len(p['overlays']) for _,p in pages)==956
assert sum(len(p['actions']) for _,p in pages)==1328
assert len(reg['workflows'])==20
assert len(assign['workstreams'])==6
assert set(assign['screen_owner'])==set(ids)
assert set(a['code'] for a in apps)==set(c for w in assign['workstreams'].values() for c in w['apps'])
assert len(assign['screen_owner'])==316
print('VALID: 35 applications; 316 unique screen IDs/routes; 1323 tabs; 956 overlays; 1328 actions; 20 workflows; 6 workstreams.')
print('Screen ownership:',dict(sorted(Counter(assign['screen_owner'].values()).items())))
