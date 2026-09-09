import sys, re, json
sys.stdout.reconfigure(encoding='utf-8')

with open('source_docs/extracted_pdf_raw.txt', 'r', encoding='utf-8') as f:
    pdf_text = f.read()

lines = [l.strip() for l in pdf_text.split('\n') if l.strip()]
lines = [l for l in lines if not re.match(r'^=== PAGE \d+ ===$', l) and not re.match(r'^ገጽ \d+ ከ \d+$', l)]

# Section 3: lines 66 to 169
sec3_lines = lines[66:169]
sec3_questions = {}
current_q = None

for l in sec3_lines:
    m = re.match(r'^(\d{2})\.\s+(.*)$', l)
    opt_m = re.match(r'^([ሀ-ፐA-D])\)\s+(.*)$', l)
    if m:
        current_q = int(m.group(1))
        sec3_questions[current_q] = {'question': m.group(2), 'options': {}}
    elif opt_m and current_q:
        sec3_questions[current_q]['options'][opt_m.group(1)] = opt_m.group(2)
    elif current_q and not opt_m:
        if not sec3_questions[current_q]['options']:
            sec3_questions[current_q]['question'] += ' ' + l
        else:
            last_opt = list(sec3_questions[current_q]['options'].keys())[-1]
            sec3_questions[current_q]['options'][last_opt] += ' ' + l

print(f'Section 3 count: {len(sec3_questions)}')
for qn in sorted(sec3_questions.keys()):
    opts = ', '.join([f"{k}: {v[:20]}" for k, v in sec3_questions[qn]['options'].items()])
    print(f"Q{qn} ({len(sec3_questions[qn]['options'])} opts): {sec3_questions[qn]['question'][:40]}... -> {opts}")

# Section 4: lines 170 to end
sec4_lines = lines[170:]
sec4_questions = {}
current_q = None
for l in sec4_lines:
    m = re.match(r'^(\d{2})\.\s+(.*)$', l)
    if m:
        current_q = int(m.group(1))
        sec4_questions[current_q] = m.group(2)
    elif current_q:
        sec4_questions[current_q] += ' ' + l

print(f'Section 4 count: {len(sec4_questions)}')
for qn in sorted(sec4_questions.keys()):
    print(f"Q{qn}: {sec4_questions[qn][:60]}...")
