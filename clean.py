with open('templates/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if line.strip() == '<main class="w-full">':
        new_lines.append(line)
        skip = True
        continue
    if skip:
        if line.strip().startswith('<section class="latex-section"'):
            skip = False
            new_lines.append(line)
        continue
    new_lines.append(line)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Cleaned up index.html successfully.')
