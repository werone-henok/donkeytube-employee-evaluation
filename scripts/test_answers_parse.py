import sys, re, json
sys.stdout.reconfigure(encoding='utf-8')

with open('source_docs/extracted_answers_raw.txt', 'r', encoding='utf-8') as f:
    ans_lines = [l.strip() for l in f.readlines() if l.strip()]

print(f"Total answer lines: {len(ans_lines)}")

# We know the sections:
# Line 0: ክፍል 1፡ እውነት ወይም ሐሰት (True / False) -> 20 lines (1-20)
# Then ክፍል 2፡ ባዶ ቦታ ሙላ (Fill in the Blanks) -> 20 lines (21-40)
# Then ክፍል 3፡ ባለብዙ አማራጭ (Multiple Choice) -> 20 lines (41-60)
# Then ክፍል 4፡ አብራራ / አጭር መልስ (Essay / Short Answer) -> 20 questions (61-80)

# Let's inspect line indices of headers:
for idx, l in enumerate(ans_lines):
    if 'ክፍል' in l:
        print(f"Header at {idx}: {l}")

# Let's check Section 1:
sec1 = ans_lines[1:21]
print("\nSection 1 (1-20):")
for i, a in enumerate(sec1, 1):
    print(f"Ans {i}: {a}")

sec2 = ans_lines[22:42]
print("\nSection 2 (21-40):")
for i, a in enumerate(sec2, 21):
    print(f"Ans {i}: {a}")

sec3 = ans_lines[43:63]
print("\nSection 3 (41-60):")
for i, a in enumerate(sec3, 41):
    print(f"Ans {i}: {a}")

sec4 = ans_lines[64:]
print(f"\nSection 4 (61-80) has {len(sec4)} lines:")
for idx, l in enumerate(sec4):
    print(f"{idx}: {l[:60]}...")
