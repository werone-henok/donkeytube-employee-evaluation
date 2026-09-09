import json, sys

sys.stdout.reconfigure(encoding='utf-8')

with open('data/seed_evaluation_v1.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

assert data['total_questions'] == 80, f"Expected 80 questions, got {data['total_questions']}"
assert data['total_points'] == 100, f"Expected 100 points, got {data['total_points']}"
assert data['time_limit_minutes'] == 150, f"Expected 150 min, got {data['time_limit_minutes']}"
assert len(data['questions']) == 80, f"Expected 80 questions array, got {len(data['questions'])}"
assert len(data['answers']) == 80, f"Expected 80 answers array, got {len(data['answers'])}"

# Check question numbers
q_nums = [q['question_number'] for q in data['questions']]
assert q_nums == list(range(1, 81)), f"Question numbers mismatch: {q_nums}"

# Check answer numbers
a_nums = [a['question_number'] for a in data['answers']]
assert a_nums == list(range(1, 81)), f"Answer numbers mismatch: {a_nums}"

# Check sections
sec_counts = {1: 0, 2: 0, 3: 0, 4: 0}
sec_points = {1: 0, 2: 0, 3: 0, 4: 0}
for q in data['questions']:
    s = q['section_number']
    sec_counts[s] += 1
    sec_points[s] += q['points']
    if s == 3:
        assert len(q['choices']) == 4, f"Q{q['question_number']} choices count is {len(q['choices'])}"
        choice_keys = [c['key'] for c in q['choices']]
        assert 'ሀ' in choice_keys and 'ለ' in choice_keys and 'ሐ' in choice_keys and 'መ' in choice_keys, f"Q{q['question_number']} keys: {choice_keys}"

assert sec_counts == {1: 20, 2: 20, 3: 20, 4: 20}, f"Section counts mismatch: {sec_counts}"
assert sec_points == {1: 20, 2: 20, 3: 40, 4: 20}, f"Section points mismatch: {sec_points}"

print("PASS: 10-point validation succeeded!")
print(f"- 80/80 questions imported")
print(f"- 80/80 answers mapped")
print(f"- 100/100 points configured")
print(f"- 4 sections verified (Sec 1: 20pts, Sec 2: 20pts, Sec 3: 40pts, Sec 4: 20pts)")
print(f"- Time limit: {data['time_limit_minutes']} minutes (2 hrs 30 mins)")
print(f"- Version: {data['version']}")
