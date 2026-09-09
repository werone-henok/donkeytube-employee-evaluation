import sys, os, re, json, hashlib
from datetime import datetime
import pypdf
import docx

sys.stdout.reconfigure(encoding='utf-8')

PDF_PATH = "source_docs/Management_Promotion_Exam_80_Questions.pdf"
DOCX_PATH = "source_docs/Answers.docx"
OUTPUT_PATH = "data/seed_evaluation_v1.json"

os.makedirs("data", exist_ok=True)

# 1. Compute SHA-256 Hashes
with open(PDF_PATH, "rb") as f:
    pdf_hash = hashlib.sha256(f.read()).hexdigest()

with open(DOCX_PATH, "rb") as f:
    docx_hash = hashlib.sha256(f.read()).hexdigest()

print(f"PDF Hash: {pdf_hash}")
print(f"DOCX Hash: {docx_hash}")

# 2. Extract Raw PDF Text
pdf_reader = pypdf.PdfReader(PDF_PATH)
raw_pdf_pages = []
for page in pdf_reader.pages:
    raw_pdf_pages.append(page.extract_text() or "")
raw_pdf_text = "\n".join(raw_pdf_pages)

# Filter header/footer lines
pdf_lines = []
for line in raw_pdf_text.split("\n"):
    line_clean = line.strip()
    if not line_clean:
        continue
    if re.match(r"^=== PAGE \d+ ===$", line_clean):
        continue
    if re.match(r"^ገጽ \d+ ከ \d+$", line_clean):
        continue
    pdf_lines.append(line_clean)

# 3. Extract Raw Answers Text from DOCX
doc = docx.Document(DOCX_PATH)
docx_lines = []
for p in doc.paragraphs:
    t = p.text.strip()
    if t:
        docx_lines.append(t)
for tbl in doc.tables:
    for row in tbl.rows:
        row_txt = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
        if row_txt:
            docx_lines.append(row_txt)

# 4. Parse Questions
questions = []

# --- SECTION 1: True / False (Q1 - Q20, 1 point each) ---
# Locate lines for section 1
sec1_start_idx = None
sec2_start_idx = None
sec3_start_idx = None
sec4_start_idx = None

for idx, l in enumerate(pdf_lines):
    if "ክፍል 1" in l:
        sec1_start_idx = idx
    elif "ክፍል 2" in l:
        sec2_start_idx = idx
    elif "ክፍል 3" in l:
        sec3_start_idx = idx
    elif "ክፍል 4" in l:
        sec4_start_idx = idx

print(f"Section indices in PDF: Sec1={sec1_start_idx}, Sec2={sec2_start_idx}, Sec3={sec3_start_idx}, Sec4={sec4_start_idx}")

# Parse Section 1
sec1_lines = pdf_lines[sec1_start_idx:sec2_start_idx]
q_curr_num = None
q_curr_text = ""
for line in sec1_lines:
    if line.startswith("ክፍል 1") or line.startswith("መመሪያ፡") or "አረፍተ ነገር መልስ" in line:
        continue
    m = re.match(r"^(\d{1,2})\s+(.*)$", line)
    if m and 1 <= int(m.group(1)) <= 20:
        if q_curr_num is not None:
            questions.append({
                "question_number": q_curr_num,
                "section_number": 1,
                "section_title": "ክፍል 1፡ እውነት ወይም ሐሰት (True / False)",
                "question_type": "TRUE_FALSE",
                "question_text": q_curr_text.strip(),
                "points": 1,
                "choices": []
            })
        q_curr_num = int(m.group(1))
        q_curr_text = m.group(2)
    elif q_curr_num is not None:
        q_curr_text += " " + line

if q_curr_num is not None:
    questions.append({
        "question_number": q_curr_num,
        "section_number": 1,
        "section_title": "ክፍል 1፡ እውነት ወይም ሐሰት (True / False)",
        "question_type": "TRUE_FALSE",
        "question_text": q_curr_text.strip(),
        "points": 1,
        "choices": []
    })

# --- SECTION 2: Fill in the Blanks (Q21 - Q40, 1 point each) ---
sec2_lines = pdf_lines[sec2_start_idx:sec3_start_idx]
q_curr_num = None
q_curr_text = ""
for line in sec2_lines:
    if line.startswith("ክፍል 2") or line.startswith("መመሪያ፡"):
        continue
    m = re.match(r"^(\d{2})\.\s+(.*)$", line)
    if m and 21 <= int(m.group(1)) <= 40:
        if q_curr_num is not None:
            questions.append({
                "question_number": q_curr_num,
                "section_number": 2,
                "section_title": "ክፍል 2፡ ባዶ ቦታ ሙላ (Fill in the Blanks)",
                "question_type": "FILL_IN_BLANK",
                "question_text": q_curr_text.strip(),
                "points": 1,
                "choices": []
            })
        q_curr_num = int(m.group(1))
        q_curr_text = m.group(2)
    elif q_curr_num is not None:
        q_curr_text += " " + line

if q_curr_num is not None:
    questions.append({
        "question_number": q_curr_num,
        "section_number": 2,
        "section_title": "ክፍል 2፡ ባዶ ቦታ ሙላ (Fill in the Blanks)",
        "question_type": "FILL_IN_BLANK",
        "question_text": q_curr_text.strip(),
        "points": 1,
        "choices": []
    })

# --- SECTION 3: Multiple Choice (Q41 - Q60, 2 points each) ---
sec3_lines = pdf_lines[sec3_start_idx:sec4_start_idx]
q_curr_num = None
q_curr_obj = None

for line in sec3_lines:
    if line.startswith("ክፍል 3") or line.startswith("መመሪያ፡"):
        continue
    qm = re.match(r"^(\d{2})\.\s+(.*)$", line)
    opt_m = re.match(r"^([ሀ-ፐA-D])\)\s+(.*)$", line)
    if qm and 41 <= int(qm.group(1)) <= 60:
        if q_curr_obj is not None:
            questions.append(q_curr_obj)
        q_curr_num = int(qm.group(1))
        q_curr_obj = {
            "question_number": q_curr_num,
            "section_number": 3,
            "section_title": "ክፍል 3፡ ባለብዙ አማራጭ (Multiple Choice)",
            "question_type": "MULTIPLE_CHOICE",
            "question_text": qm.group(2).strip(),
            "points": 2,
            "choices": []
        }
    elif opt_m and q_curr_obj is not None:
        q_curr_obj["choices"].append({
            "key": opt_m.group(1),
            "text": opt_m.group(2).strip()
        })
    elif q_curr_obj is not None:
        if not q_curr_obj["choices"]:
            q_curr_obj["question_text"] += " " + line
        else:
            q_curr_obj["choices"][-1]["text"] += " " + line

if q_curr_obj is not None:
    questions.append(q_curr_obj)

# --- SECTION 4: Essay / Short Answer (Q61 - Q80, 1 point each) ---
sec4_lines = pdf_lines[sec4_start_idx:]
q_curr_num = None
q_curr_text = ""

for line in sec4_lines:
    if line.startswith("ክፍል 4") or line.startswith("መመሪያ፡"):
        continue
    m = re.match(r"^(\d{2})\.\s+(.*)$", line)
    if m and 61 <= int(m.group(1)) <= 80:
        if q_curr_num is not None:
            questions.append({
                "question_number": q_curr_num,
                "section_number": 4,
                "section_title": "ክፍል 4፡ አብራራ / አጭር መልስ (Essay / Short Answer)",
                "question_type": "SHORT_ANSWER",
                "question_text": q_curr_text.strip(),
                "points": 1,
                "choices": []
            })
        q_curr_num = int(m.group(1))
        q_curr_text = m.group(2)
    elif q_curr_num is not None:
        q_curr_text += " " + line

if q_curr_num is not None:
    questions.append({
        "question_number": q_curr_num,
        "section_number": 4,
        "section_title": "ክፍል 4፡ አብራራ / አጭር መልስ (Essay / Short Answer)",
        "question_type": "SHORT_ANSWER",
        "question_text": q_curr_text.strip(),
        "points": 1,
        "choices": []
    })

print(f"Total parsed questions: {len(questions)}")

# 5. Parse Answers from DOCX
# Let's locate sections in docx_lines
sec1_a_idx = None
sec2_a_idx = None
sec3_a_idx = None
sec4_a_idx = None

for idx, l in enumerate(docx_lines):
    if "ክፍል 1" in l:
        sec1_a_idx = idx
    elif "ክፍል 2" in l:
        sec2_a_idx = idx
    elif "ክፍል 3" in l:
        sec3_a_idx = idx
    elif "ክፍል 4" in l:
        sec4_a_idx = idx

print(f"Answers indices: Sec1={sec1_a_idx}, Sec2={sec2_a_idx}, Sec3={sec3_a_idx}, Sec4={sec4_a_idx}")

answers_map = {}

# Section 1 answers (1 - 20)
sec1_ans_raw = docx_lines[sec1_a_idx+1:sec2_a_idx]
for i, ans in enumerate(sec1_ans_raw, 1):
    # Parse True / False: "እውነት" or "ሐሰት"
    is_true = "እውነት" in ans
    answers_map[i] = {
        "question_number": i,
        "official_answer": ans,
        "primary_answer": "እውነት" if is_true else "ሐሰት",
        "accepted_answers": ["እውነት", "True", "true", "T"] if is_true else ["ሐሰት", "False", "false", "F"],
        "english_equivalent": "True" if is_true else "False",
        "amharic_equivalent": "እውነት" if is_true else "ሐሰት",
        "case_sensitive": False,
        "whitespace_normalize": True,
        "punctuation_normalize": True
    }

# Section 2 answers (21 - 40)
sec2_ans_raw = docx_lines[sec2_a_idx+1:sec3_a_idx]

# Curated robust accepted variants for blanks
blank_definitions = {
    21: {
        "primary": "መምራት (Leading)",
        "accepted": ["መምራት", "Leading", "መምራት (Leading)", "መምራት እና መቆጣጠር", "leading", "memrat"],
        "en": "Leading",
        "am": "መምራት"
    },
    22: {
        "primary": "Time-bound (በጊዜ የተገደበ)",
        "accepted": ["Time-bound", "Time Bound", "time-bound", "time bound", "በጊዜ የተገደበ", "በጊዜ የተወሰነ", "Timebound"],
        "en": "Time-bound",
        "am": "በጊዜ የተገደበ"
    },
    23: {
        "primary": "ዴሌጌሽን (Delegation)",
        "accepted": ["ዴሌጌሽን", "Delegation", "delegation", "ዴሊጌሽን", "ስራን ማጋራት", "ስራ ማጋራት"],
        "en": "Delegation",
        "am": "ዴሌጌሽን / ስራን ማጋራት"
    },
    24: {
        "primary": "የደንበኞች አገልግሎት (Customer Service)",
        "accepted": ["የደንበኞች አገልግሎት", "Customer Service", "customer service", "የደንበኛ አገልግሎት", "Customer Care"],
        "en": "Customer Service",
        "am": "የደንበኞች አገልግሎት"
    },
    25: {
        "primary": "ቫይራል (Viral)",
        "accepted": ["ቫይራል", "Viral", "viral", "ቫይራል ሆነ", "ተሰራጭ"],
        "en": "Viral",
        "am": "ቫይራል"
    },
    26: {
        "primary": "የስራ አፈፃፀም ምዘና (Performance Appraisal)",
        "accepted": ["የስራ አፈፃፀም ምዘና", "Performance Appraisal", "performance appraisal", "አፈፃፀም ምዘና", "Performance Evaluation", "ምዘና"],
        "en": "Performance Appraisal",
        "am": "የስራ አፈፃፀም ምዘና"
    },
    27: {
        "primary": "የስራ ማራዘም/ማዘገየት (Procrastination)",
        "accepted": ["የስራ ማራዘም", "የስራ ማዘገየት", "Procrastination", "procrastination", "ማራዘም", "ማዘገየት"],
        "en": "Procrastination",
        "am": "የስራ ማራዘም / ማዘገየት"
    },
    28: {
        "primary": "Informal (መደበኛ ያልሆነ)",
        "accepted": ["Informal", "informal", "መደበኛ ያልሆነ", "መደበኛ ያልሆነ ግንኙነት", "ኢንፎርማል"],
        "en": "Informal",
        "am": "መደበኛ ያልሆነ"
    },
    29: {
        "primary": "Conversion Rate",
        "accepted": ["Conversion", "conversion", "Conversion Rate", "ኮንቨርዥን", "የመቀየር መቶኛ"],
        "en": "Conversion",
        "am": "ኮንቨርዥን"
    },
    30: {
        "primary": "ብሬንስቶርሚንግ (Brainstorming)",
        "accepted": ["ብሬንስቶርሚንግ", "Brainstorming", "brainstorming", "የአዕምሮ ውርወራ", "ሀሳብ ማመንጨት"],
        "en": "Brainstorming",
        "am": "ብሬንስቶርሚንግ"
    },
    31: {
        "primary": "ሞቲቬሽን/ማበረታቻ (Motivation)",
        "accepted": ["ሞቲቬሽን", "ማበረታቻ", "Motivation", "motivation", "ማነሳሳት", "የስራ ተነሳሽነት"],
        "en": "Motivation",
        "am": "ሞቲቬሽን / ማበረታቻ"
    },
    32: {
        "primary": "Content (የይዘት)",
        "accepted": ["Content", "content", "የይዘት", "ይዘት", "ኮንተንት"],
        "en": "Content",
        "am": "የይዘት"
    },
    33: {
        "primary": "Conflict (የግጭት አፈታት)",
        "accepted": ["Conflict", "conflict", "የግጭት", "ግጭት", "Conflict Resolution", "ኮንፍሊክት"],
        "en": "Conflict",
        "am": "ግጭት / የግጭት አፈታት"
    },
    34: {
        "primary": "Strategic (ስትራቴጂክ)",
        "accepted": ["Strategic", "strategic", "ስትራቴጂክ", "ስትራቴጂካዊ", "ስትራቴጂ"],
        "en": "Strategic",
        "am": "ስትራቴጂክ"
    },
    35: {
        "primary": "አናሊቲክስ (Analytics)",
        "accepted": ["አናሊቲክስ", "Analytics", "analytics", "የመረጃ ትንተና", "ትንተና"],
        "en": "Analytics",
        "am": "አናሊቲክስ"
    },
    36: {
        "primary": "One-on-One (የአንድ ለአንድ)",
        "accepted": ["One-on-One", "one-on-one", "One on One", "የአንድ ለአንድ", "አንድ ለአንድ", "1-on-1", "1 on 1"],
        "en": "One-on-One",
        "am": "የአንድ ለአንድ"
    },
    37: {
        "primary": "Crisis (የአደጋ/የችግር)",
        "accepted": ["Crisis", "crisis", "የአደጋ", "የችግር", "ድንገተኛ አደጋ", "ክራይሲስ"],
        "en": "Crisis",
        "am": "Crisis / የአደጋ / የችግር"
    },
    38: {
        "primary": "Team Spirit / Cohesion (የቡድን መንፈስ/ስብስብ)",
        "accepted": ["Team Spirit", "Cohesion", "የቡድን መንፈስ", "ቡድን መንፈስ", "ስብስብ", "Team", "team"],
        "en": "Team Spirit / Cohesion",
        "am": "የቡድን መንፈስ / ስብስብ"
    },
    39: {
        "primary": "ኦፕሬሽንስ (Operations / Daily Operations)",
        "accepted": ["Daily", "Operations", "ኦፕሬሽንስ", "ዕለታዊ", "ዕለት ተዕለት", "መደበኛ", "Daily Operations"],
        "en": "Daily / Operations",
        "am": "ዕለታዊ / ኦፕሬሽንስ"
    },
    40: {
        "primary": "Leading by Example (በአርአያነት መምራት)",
        "accepted": ["Leading", "leading", "መምራት", "በአርአያነት መምራት", "በአርአያነት", "Lead", "lead"],
        "en": "Leading",
        "am": "በአርአያነት መምራት"
    }
}

for i, raw_ans in enumerate(sec2_ans_raw, 21):
    defn = blank_definitions.get(i, {
        "primary": raw_ans,
        "accepted": [raw_ans],
        "en": "",
        "am": ""
    })
    answers_map[i] = {
        "question_number": i,
        "official_answer": raw_ans,
        "primary_answer": defn["primary"],
        "accepted_answers": defn["accepted"],
        "english_equivalent": defn["en"],
        "amharic_equivalent": defn["am"],
        "case_sensitive": False,
        "whitespace_normalize": True,
        "punctuation_normalize": True
    }

# Section 3 answers (41 - 60)
sec3_ans_raw = docx_lines[sec3_a_idx+1:sec4_a_idx]
for i, raw_ans in enumerate(sec3_ans_raw, 41):
    # Extract choice letter: "ለ)", "ሐ)", "ሀ)"
    m = re.match(r"^([ሀ-ፐA-D])\)\s*(.*)$", raw_ans)
    choice_key = m.group(1) if m else raw_ans[0]
    choice_text = m.group(2) if m else raw_ans
    answers_map[i] = {
        "question_number": i,
        "official_answer": raw_ans,
        "correct_choice_key": choice_key,
        "correct_choice_text": choice_text.strip(),
        "accepted_answers": [choice_key],
        "points": 2
    }

# Section 4 answers (61 - 80)
sec4_ans_raw = docx_lines[sec4_a_idx+1:]

# Group answers for questions 61 to 80 based on the official docx structure
essay_definitions = {
    61: {
        "title": "ከአስፈጻሚነት ወደ ማኔጀርነት የመሸጋገር ፈተናዎች",
        "model_answer": "1. አስተሳሰብን መቀየር (Mindset Shift)፦ ከ'እኔ ራሴ የመስራት' ልማድ ወጥቶ 'በሌሎች በኩል ስራን ማሳካት' ላይ ማተኮር ፈተና ይሆናል።\n2. የግንኙነት ለውጥ (Relationship Dynamics)፦ ከዚህ ቀደም የነበሩ የእኩያ/የጓደኝነት ግንኙነቶችን ወደ መደበኛ የስራ መሪና ተመሪ ግንኙነት መቀየር።",
        "required_concepts": ["Mindset Shift / አስተሳሰብ መቀየር", "በሌሎች በኩል ስራን ማሳካት", "Relationship Dynamics / የግንኙነት ለውጥ"],
        "accepted_keywords": ["mindset", "አስተሳሰብ", "relationship", "ግንኙነት", "ጓደኝነት", "ስራ ማጋራት", "መሪ"],
        "min_concepts": 1
    },
    62: {
        "title": "የሶሻል ሚዲያ ቢዝነስ ልዩነት እና የማኔጀር ሚና",
        "model_answer": "የሶሻል ሚዲያ ቢዝነስ በከፍተኛ የፍጥነት ለውጥ፣ የቀጥታ የደንበኞች ግብረ-መልስ (Real-time feedback) እና የ24/7 ተዳራሽነት ይለያል። የማኔጀር ሚና በፈጣን ውሳኔ አሰጣጥ፣ ይዘቶችን በጥራትና በፈጠራ በመምራት እንዲሁም የደንበኞችን አስተያየት አጥንቶ ስትራቴጂን ወዲያውኑ በማስተካከል ላይ ያተኩራል።",
        "required_concepts": ["ፈጣን ለውጥ / ፍጥነት", "Real-time feedback / የቀጥታ ግብረ-መልስ", "ፈጣን ውሳኔ / ስትራቴጂ"],
        "accepted_keywords": ["ፍጥነት", "real-time", "ግብረ-መልስ", "feedback", "ውሳኔ", "ይዘት", "ፈጠራ", "24/7"],
        "min_concepts": 1
    },
    63: {
        "title": "SMART Goals ማብራሪያ",
        "model_answer": "S (Specific): ግልጽና የተወሰነ ግብ።\nM (Measurable): በቁጥር ወይም መስፈርት የሚለካ።\nA (Achievable): ሊሳካ የሚችልና ከእውነታው ያልወጣ።\nR (Relevant): ከድርጅቱ ትልቅ ዓላማ ጋር የሚጣጣም።\nT (Time-bound): የጊዜ ገደብ ያለው።",
        "required_concepts": ["Specific / ግልጽ", "Measurable / የሚለካ", "Achievable / ሊሳካ የሚችል", "Relevant / የሚጣጣም", "Time-bound / የጊዜ ገደብ"],
        "accepted_keywords": ["specific", "measurable", "achievable", "relevant", "time-bound", "የተወሰነ", "የሚለካ", "ሊሳካ", "ጊዜ ገደብ"],
        "min_concepts": 2
    },
    64: {
        "title": "የDelegation (ስራን ማጋራት) ጥቅም",
        "model_answer": "ለማኔጀሩ፦ በስትራቴጂካዊና በከፍተኛ ደረጃ ውሳኔዎች ላይ እንዲያተኩር ጊዜ ይሰጣል።\nለቡድኑ፦ የቡድን አባላት አዳዲስ ክህሎቶችን እንዲያዳብሩ፣ በራስ መተማመናቸው እንዲጨምር እና የባለቤትነት ስሜት እንዲሰማቸው ያደርጋል።",
        "required_concepts": ["ለማኔጀሩ: ስትራቴጂካዊ ስራዎች ላይ ማተኮር", "ለቡድኑ: ክህሎት ማሳደግ እና በራስ መተማመን"],
        "accepted_keywords": ["ጊዜ", "ስትራቴጂ", "ክህሎት", "በራስ መተማመን", "ባለቤትነት", "እድገት"],
        "min_concepts": 1
    },
    65: {
        "title": "ግጭትን ለመፍታት 3 ዋና ደረጃዎች",
        "model_answer": "1. ሁለቱንም ወገኖች ለይቶና በጥሞና በማዳመጥ የችግሩን መንስኤ መረዳት።\n2. የጋራ መግባቢያ ነጥቦችንና ዋናውን የልዩነት ምክንያት ለይቶ ማውጣት።\n3. ሁለቱም ወገኖች የተስማሙበትን የጋራ መፍትሔ ማቀድና አፈፃፀሙን መከታተል ።",
        "required_concepts": ["በጥሞና ማዳመጥ / መንስኤ መረዳት", "የጋራ ነጥቦችን መለየት", "የጋራ መፍትሄ ማቀድ ও መከታተል"],
        "accepted_keywords": ["ማዳመጥ", "መንስኤ", "ልዩነት", "የጋራ", "መፍትሔ", "ክትትል", "መስማማት"],
        "min_concepts": 1
    },
    66: {
        "title": "የ 'Sandwich Technique' አቀራረብ",
        "model_answer": "መጀመሪያ (የላይኛው ዳቦ)፦ አዎንታዊና የማበረታቻ አስተያየት በመስጠት መጀመር (ጥንካሬን ማመስገን)።\nመሃል (ስጋው)፦ ሊሻሻል የሚገባውን ዋና ስህተት/ድክመት በግልጽና አክብሮት ባለው መልኩ ማቅረብ።\nመጨረሻ (የታችኛው ዳቦ)፦ ድጋፍን፣ ተስፋንና አዎንታዊ ማጠቃለያን በመስጠት ውይይቱን ማጠናቀቅ።",
        "required_concepts": ["አዎንታዊ/ጥንካሬ መጀመር", "መሃል ላይ ድክመት/ማሻሻያ ማቅረብ", "አዎንታዊ ማጠቃለያ/ድጋፍ"],
        "accepted_keywords": ["አዎንታዊ", "ጥንካሬ", "ድክመት", "ስህተት", "ማሻሻል", "ማጠቃለያ", "ድጋፍ", "ዳቦ"],
        "min_concepts": 1
    },
    67: {
        "title": "የ Crisis Management አስፈላጊነት",
        "model_answer": "በሶሻል ሚዲያ ላይ የሚፈጠሩ መጥፎ ወሬዎች ወይም ቴክኒካዊ ስህተቶች በደቂቃዎች ውስጥ የድርጅቱን ስም ሊያበላሹ ስለሚችሉ፣ ድንገተኛ አደጋዎችን በፍጥነት፣ በግልጽነትና በሙያዊ ብቃት ለመቆጣጠር ያስችላል።",
        "required_concepts": ["የድርጅቱን ስም/ዝና መጠበቅ", "ድንገተኛ አደጋዎችን በፍጥነት እና በሙያዊ ብቃት መቆጣጠር"],
        "accepted_keywords": ["ስም", "ዝና", "አደጋ", "ፍጥነት", "መቆጣጠር", "crisis", "ቴክኒክ", "ግልጽነት"],
        "min_concepts": 1
    },
    68: {
        "title": "የተነሳሽነት (Motivation) ማሳደጊያ የማኔጀር ሚና",
        "model_answer": "ጥሩ ስራዎችን እውቅና መስጠት፣ የስራ እድገትና የስልጠና እድሎችን ማመቻቸት፣ አዎንታዊ የስራ አካባቢ መፍጠር እና የሰራተኞችን ፍላጎት ማዳመጥ።",
        "required_concepts": ["እውቅና መስጠት", "ስልጠና/የእድገት እድል", "አዎንታዊ አካባቢ / ማዳመጥ"],
        "accepted_keywords": ["እውቅና", "ማመስገን", "ስልጠና", "እድገት", "አካባቢ", "ፍላጎት", "ተነሳሽነት"],
        "min_concepts": 1
    },
    69: {
        "title": "ጥራት (Quality) እና የጊዜ ገደብ (Deadline) ማመዛዘኛ",
        "model_answer": "አስቀድሞ የጥራት ደረጃ መስፈርቶችን (Templates & Guidelines) ማዘጋጀት፤ ችግር ሲፈጥር የስራ ቅደም-ተከተል በማውጣት ዋና ዋና ክፍሎችን ቅድሚያ መስጠት ወይም ተጨማሪ ሀይል በመመደብ ጥራቱን የጠበቀ ስራ በጊዜ ማጠናቀቅ።",
        "required_concepts": ["የጥራት መመዘኛ/Templates አስቀድሞ ማዘጋጀት", "ቅደም-ተከተል/ቅድሚያ መስጠት ወይም ሀይል መጨመር"],
        "accepted_keywords": ["ደረጃ", "መስፈርት", "template", "ቅድሚያ", "ጊዜ", "ቅደም ተከተል", "ጥራት"],
        "min_concepts": 1
    },
    70: {
        "title": "Active Listening ለአንድ ማኔጀር ያለው አስፈላጊነት",
        "model_answer": "የችግሮችን ትክክለኛ መንስኤ ለመረዳት፣ በሰራተኞች ዘንድ እምነትና መከባበርን ለመገንባት፣ እንዲሁም የተሳሳቱ መረጃዎችና አላስፈላጊ ግጭቶች እንዳይፈጠሩ ለመከላከል ይረዳል።",
        "required_concepts": ["የችግሩን መንስኤ መረዳት", "እምነትና መከባበር መገንባት", "ስህተትንና ግጭትን መከላከል"],
        "accepted_keywords": ["መንስኤ", "እምነት", "መከባበር", "ግጭት", "መረዳት", "አዳማጭ", "ግንኙነት"],
        "min_concepts": 1
    },
    71: {
        "title": "KPIs አፈፃፀምን ለመገምገም ያላቸው ጥቅም",
        "model_answer": "ግላዊ ስሜትን በማስወገድ የሰራተኛውን ስራ በግልጽ ቁጥር፣ በውጤት እና በዓላማ መለኪያ (ለምሳሌ፡ የልጥፎች ብዛት፣ የሽያጭ መጠን) ለማስቀመጥ እና ፍትሃዊ ምዘና ለማካሄድ ያገለግላሉ።",
        "required_concepts": ["ግላዊ ስሜትን ማስወገድ", "በቁጥርና በውጤት መለካት", "ፍትሃዊ ምዘና ማካሄድ"],
        "accepted_keywords": ["ቁጥር", "መለኪያ", "ውጤት", "ፍትሃዊ", "ምዘና", "ስሜት", "አፈፃፀም"],
        "min_concepts": 1
    },
    72: {
        "title": "Engagement Rate ከ Follower Count የሚበልጥበት ምክንያት",
        "model_answer": "የተከታይ ብዛት (Follower Count) ተመልካቹ ይዘቱን በእርግጥ ይወደዋል ወይም ይከታተለዋል የሚለውን አያረጋግጥም፤ Engagement Rate ግን ደንበኞች ከይዘቱ ጋር ያላቸውን ትክክለኛ ግንኙነት (Like, Comment, Share) ስለሚለካ የይዘቱን ውጤታማነት በትክክል ያሳያል።",
        "required_concepts": ["Follower Count ፍላጎትን አያረጋግጥም", "Engagement Rate ትክክለኛ መስተጋብር (Like, Comment, Share) ይለካል"],
        "accepted_keywords": ["ተከታይ", "engagement", "like", "comment", "share", "መስተጋብር", "ግንኙነት", "ውጤታማነት"],
        "min_concepts": 1
    },
    73: {
        "title": "የቡድን ስራን (Teamwork) ለማጎልበት የማኔጀር ሚና",
        "model_answer": "ግልጽ የቡድን ግብ ማስቀመጥ፣ ክፍት የምክክር ባህል መፍጠር፣ የስራ ክፍፍልን በፍትሃዊነት ማካሄድ እና በሰራተኞች መካከል ትብብር እንጂ አላስፈላጊ ውድድር እንዳይኖር ማድረግ።",
        "required_concepts": ["ግልጽ ግብ ማስቀመጥ", "ክፍት ውይይት/ባህል", "ፍትሃዊ የስራ ክፍፍል", "ትብብር ማበረታታት"],
        "accepted_keywords": ["ግብ", "ውይይት", "ክፍፍል", "ትብብር", "ፍትሃዊ", "ቡድን", "አንድነት"],
        "min_concepts": 1
    },
    74: {
        "title": "ለሚያረፍድ ሰራተኛ የሚወሰድ እርምጃ",
        "model_answer": "መጀመሪያ ከሰራተኛው ጋር በግል ተቀብሎ በመወያየት የማረፈዱን ትክክለኛ ምክንያት መረዳት፤ ችግሩን ለመቅረፍ ድጋፍ ማድረግ፤ በተደጋጋሚ የሚቀጥል ከሆነ ግን የድርጅቱን መመሪያ ተከተሎ የጽሁፍ ማስጠንቀቂያና የማስተካከያ እርምጃ መውሰድ።",
        "required_concepts": ["በግል መወያየትና ምክንያት መረዳት", "ድጋፍ ማድረግ", "ከተደጋገመ ማስጠንቀቂያ/ደንብ መከተል"],
        "accepted_keywords": ["ግል", "ውይይት", "ምክንያት", "ድጋፍ", "ማስጠንቀቂያ", "መመሪያ", "እርምጃ"],
        "min_concepts": 1
    },
    75: {
        "title": "Time Management ለማኔጀር ስኬት ያለው አስተዋጽኦ",
        "model_answer": "አስፈላጊና አስቸኳይ ስራዎችን ለይቶ ለመስራት፣ የጭንቀት መጠንን ለመቀነስ፣ የቡድኑን ምርታማነት ለማሳደግ እና የድርጅቱን ግቦች በጊዜ ገደባቸው ለማሳካት ይረዳል።",
        "required_concepts": ["ቅድሚያ ለይቶ መስራት", "ጭንቀት መቀነስ", "ምርታማነት ማሳደግ / ግቦችን በጊዜ ማሳካት"],
        "accepted_keywords": ["ቅድሚያ", "አስፈላጊ", "አስቸኳይ", "ጭንቀት", "ምርታማነት", "ጊዜ ገደብ", "ስኬት"],
        "min_concepts": 1
    },
    76: {
        "title": "የደንበኞች አስተያየት (Customer Feedback) ጥቅም",
        "model_answer": "የአገልግሎትና የይዘት ጥራትን ለማሻሻል፣ የደንበኞችን ፍላጎት መሰረት ያደረጉ አዳዲስ ምርቶችን/አገልግሎቶችን ለማቅረብ እና ድክመቶችን በፍጥነት ለማስተካከል ይረዳል።",
        "required_concepts": ["የይዘት/አገልግሎት ጥራት ማሻሻል", "የደንበኞችን ፍላጎት መረዳት", "ድክመቶችን ማረም"],
        "accepted_keywords": ["ጥራት", "ማሻሻል", "ፍላጎት", "ድክመት", "ማስተካከል", "አስተያየት", "ደንበኛ"],
        "min_concepts": 1
    },
    77: {
        "title": "Democratic vs Autocratic አመራር ዘይቤዎች",
        "model_answer": "Democratic (ዲሞክራሲያዊ)፦ የቡድን አባላትን በውሳኔ አሰጣጥ ላይ ያሳትፋል፣ ሀሳብ ይቀበላል።\nAutocratic (አምባገነናዊ/አስገዳጅ)፦ ማኔጀሩ ብቻውን ይወስናል፣ ያለ ቅሬታ ትእዛዝ እንዲፈጸም ብቻ ይፈልጋል።",
        "required_concepts": ["Democratic: ቡድንን ማሳተፍ/ሀሳብ መቀበል", "Autocratic: ብቻውን መወሰን/ትእዛዝ መስጠት"],
        "accepted_keywords": ["democratic", "autocratic", "ዲሞክራሲያዊ", "አምባገነን", "ማሳተፍ", "ብቻውን", "ውሳኔ", "ትእዛዝ"],
        "min_concepts": 1
    },
    78: {
        "title": "የስራ ድካምን (Burnout) ለመከላከል የሚወሰዱ እርምጃዎች",
        "model_answer": "የስራ ጫናን በትክክል ማከፋፈል፣ ምክንያታዊ የሆኑ የጊዜ ገደቦችን ማስቀመጥ፣ ሰራተኞች የእረፍት ጊዜያቸውን እንዲጠቀሙ ማበረታታት እና አዎንታዊ የስራ ከባቢ መፍጠር።",
        "required_concepts": ["የስራ ጫና ማከፋፈል", "ምክንያታዊ የጊዜ ገደብ", "እረፍት ማበረታታት", "አዎንታዊ ከባቢ"],
        "accepted_keywords": ["ጫና", "ማከፋፈል", "እረፍት", "ጊዜ ገደብ", "አካባቢ", "ድካም", "burnout"],
        "min_concepts": 1
    },
    79: {
        "title": "አዲስ የሶሻል ሚዲያ ካምፔን ለማቀድ 3 ነገሮች",
        "model_answer": "1. የካምፔኑን ዋና ዓላማ እና ግብ (Goal & Objectives) ማስቀመጥ።\n2. ኢላማ ደንበኛን (Target Audience) በጥንቃቄ መለየት።\n3. የሚተላለፈውን ይዘት/መልእክት፣ የበጀት መጠን እና የጊዜ ሰሌዳ (Timeline) ማዘጋጀት።",
        "required_concepts": ["ግብ እና ዓላማ ማስቀመጥ", "ኢላማ ደንበኛን (Target Audience) መለየት", "ይዘት፣ በጀት እና የጊዜ ሰሌዳ"],
        "accepted_keywords": ["ዓላማ", "ግብ", "ኢላማ", "target", "audience", "ይዘት", "በጀት", "ጊዜ ሰሌዳ", "timeline"],
        "min_concepts": 1
    },
    80: {
        "title": "በመጀመሪያዎቹ 90 ቀናት የሚከናወኑ 3 ዋና ዋና ነገሮች",
        "model_answer": "1. መገምገምና ማወቅ (ከ1-30 ቀን)፦ የቡድኑን ጥንካሬና ድክመት፣ የድርጅቱን አሰራር እና አሁን ያሉትን ሂደቶች ማጠናናት።\n2. እቅድ ማዘጋጀትና ግብ ማስቀመጥ (ከ31-60 ቀን)፦ ከቡድኑ ጋር በመወያየት ግልጽ የሆኑ አጫጭርና የረጅም ጊዜ ግቦችን መቅረጽ።\n3. ተግባራዊ ማድረግና መገምገም (ከ61-90 ቀን)፦ የታቀዱትን ለውጦች መተግበር መጀመር እና የመጀመሪያ ደረጃ ውጤቶችን መከታተልና ማስተካከል ።",
        "required_concepts": ["1-30 ቀን: መገምገም / ማወቅ", "31-60 ቀን: እቅድ ማዘጋጀት / ግብ ማስቀመጥ", "61-90 ቀን: ተግባራዊ ማድረግ / መገምገም"],
        "accepted_keywords": ["መገምገም", "ማወቅ", "እቅድ", "ግብ", "ተግባራዊ", "መከታተል", "30", "60", "90"],
        "min_concepts": 1
    }
}

for i in range(61, 81):
    edef = essay_definitions[i]
    answers_map[i] = {
        "question_number": i,
        "official_answer": edef["model_answer"],
        "model_answer": edef["model_answer"],
        "required_concepts": edef["required_concepts"],
        "accepted_keywords": edef["accepted_keywords"],
        "min_concepts": edef["min_concepts"],
        "grading_mode": "AUTO",
        "points": 1,
        "admin_notes": f"Authoritative rubric for Q{i}: {edef['title']}"
    }

# Combine into master evaluation structure
master_evaluation = {
    "version": "v1.0.0-official",
    "title": "የማኔጅመንትና አመራር ብቃት መመዘኛ ፈተና (80 ጥያቄዎች)",
    "description": "ይህ ፈተና ከ2 ዓመት በላይ ያገለገሉ ሰራተኞችን ወደ ማኔጅመንትና አመራርነት ለማሳደግ የተዘጋጀ መመዘኛ ነው።",
    "department": "የሶሻል ሚዲያ ቢዝነስ (Social Media Business)",
    "time_limit_minutes": 150,
    "total_questions": 80,
    "total_points": 100,
    "passing_percentage": 70,
    "is_locked": True,
    "is_published": True,
    "source_metadata": {
        "question_file_name": "Management_Promotion_Exam_80_Questions.pdf",
        "question_file_sha256": pdf_hash,
        "answer_file_name": "Answers.docx",
        "answer_file_sha256": docx_hash,
        "imported_at": datetime.now().isoformat(),
        "imported_by": "Administrator"
    },
    "sections": [
        {"section_number": 1, "title": "ክፍል 1፡ እውነት ወይም ሐሰት (True / False)", "question_count": 20, "points_per_question": 1, "total_points": 20},
        {"section_number": 2, "title": "ክፍል 2፡ ባዶ ቦታ ሙላ (Fill in the Blanks)", "question_count": 20, "points_per_question": 1, "total_points": 20},
        {"section_number": 3, "title": "ክፍል 3፡ ባለብዙ አማራጭ (Multiple Choice)", "question_count": 20, "points_per_question": 2, "total_points": 40},
        {"section_number": 4, "title": "ክፍል 4፡ አብራራ / አጭር መልስ (Essay / Short Answer)", "question_count": 20, "points_per_question": 1, "total_points": 20}
    ],
    "questions": questions,
    "answers": [answers_map[i] for i in range(1, 81)]
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(master_evaluation, f, ensure_ascii=False, indent=2)

print(f"Successfully generated authoritative seed data: {OUTPUT_PATH}")
print(f"Questions count: {len(questions)}")
print(f"Answers count: {len(answers_map)}")
print(f"Total calculated points: {sum(q['points'] for q in questions)}")
