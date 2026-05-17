import sys

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''  try {
    const response = await fetch('/tracker/api/applications');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not load tracker snapshot');
    }'''

replacement = '''  try {
    const token = localStorage.getItem(TRACKER_WRITE_TOKEN_KEY) || '';
    const headers = token ? { 'Authorization': \Bearer \\ } : {};
    const response = await fetch('/tracker/api/applications', { headers });
    const text = await response.text();
    let data = { applications: [], counts: {} };
    if (text) {
      try { data = JSON.parse(text); } catch(e) {}
    }
    if (!response.ok) {
      throw new Error(data.error || 'Could not load tracker snapshot');
    }'''

if target in content:
    content = content.replace(target, replacement)
    with open('static/js/main.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    print('Target not found')
