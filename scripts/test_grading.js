const fs = require('fs');
const path = require('path');
const {
  gradeTrueFalse,
  gradeFillInBlank,
  gradeMultipleChoice,
  gradeShortAnswer,
  gradeCompleteEvaluation
} = require('../server/grading_engine');

console.log('--- Testing Individual Section Grading ---');

// 1. Test True/False
const tfRes1 = gradeTrueFalse('እውነት', { primary_answer: 'እውነት' });
console.log('TF Correct Amharic:', tfRes1.is_correct === true, tfRes1.points === 1);

const tfRes2 = gradeTrueFalse('True', { primary_answer: 'እውነት' });
console.log('TF Correct English True:', tfRes2.is_correct === true, tfRes2.points === 1);

const tfRes3 = gradeTrueFalse('False', { primary_answer: 'እውነት' });
console.log('TF Incorrect False:', tfRes3.is_correct === false, tfRes3.points === 0);

// 2. Test Fill in Blank
const blankKey = {
  primary_answer: 'Time-bound (በጊዜ የተገደበ)',
  accepted_answers_json: JSON.stringify(['Time-bound', 'Time Bound', 'በጊዜ የተገደበ']),
  english_equivalent: 'Time-bound',
  amharic_equivalent: 'በጊዜ የተገደበ',
  case_sensitive: 0,
  whitespace_normalize: 1,
  punctuation_normalize: 1
};

const bRes1 = gradeFillInBlank('time-bound', blankKey);
console.log('Blank Lowercase match:', bRes1.is_correct === true, bRes1.points === 1);

const bRes2 = gradeFillInBlank('በጊዜ የተገደበ', blankKey);
console.log('Blank Amharic match:', bRes2.is_correct === true, bRes2.points === 1);

const bRes3 = gradeFillInBlank('   Time   Bound  ', blankKey);
console.log('Blank Whitespace normalize match:', bRes3.is_correct === true, bRes3.points === 1);

// 3. Test Multiple Choice
const mcKey = {
  correct_choice_key: 'ለ',
  official_answer: 'ለ) ቡድኑን በመምራት፣ በማስተባበርና በመደገፍ ግቦችን ማሳካት'
};
const mcRes1 = gradeMultipleChoice('ለ', mcKey);
console.log('MC Key match (2 pts):', mcRes1.is_correct === true, mcRes1.points === 2);

const mcRes2 = gradeMultipleChoice('ሐ', mcKey);
console.log('MC Wrong key (0 pts):', mcRes2.is_correct === false, mcRes2.points === 0);

// 4. Test Essay / Short Answer
const essayRubric = {
  model_answer: 'አስተሳሰብን መቀየር (Mindset Shift) እና የግንኙነት ለውጥ (Relationship Dynamics)',
  required_concepts_json: JSON.stringify(['Mindset Shift / አስተሳሰብ መቀየር', 'Relationship Dynamics']),
  accepted_keywords_json: JSON.stringify(['mindset', 'አስተሳሰብ', 'relationship', 'ግንኙነት', 'ጓደኝነት']),
  min_concepts: 1,
  grading_mode: 'AUTO'
};

const esRes1 = gradeShortAnswer('አስፈጻሚ ወደ ማኔጀር ሲሸጋገር ዋነኛው ፈተና የአስተሳሰብ (mindset) መቀየር እና ከቡድን አባላት ጋር ያለው የስራ ግንኙነት መለወጥ ነው።', essayRubric);
console.log('Essay Good Answer Match:', esRes1.is_correct === true, esRes1.points === 1, esRes1.matched_keywords);

// 5. Test Complete Evaluation with Perfect Answers from Authoritative Seed
const seedPath = path.join(__dirname, '..', 'data', 'seed_evaluation_v1.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const questions = seed.questions;
const answers = seed.answers;

const ansKeysMap = {};
const rubricsMap = {};

for (const a of answers) {
  ansKeysMap[a.question_number] = a;
  if (a.model_answer || a.required_concepts) {
    rubricsMap[a.question_number] = {
      model_answer: a.model_answer || a.official_answer,
      required_concepts_json: JSON.stringify(a.required_concepts || []),
      accepted_keywords_json: JSON.stringify(a.accepted_keywords || []),
      min_concepts: a.min_concepts || 1,
      grading_mode: a.grading_mode || 'AUTO'
    };
  }
}

// Build 100% perfect submission
const perfectSubmission = {};
for (const q of questions) {
  const qNum = q.question_number;
  if (q.section_number === 1) {
    perfectSubmission[qNum] = ansKeysMap[qNum].primary_answer;
  } else if (q.section_number === 2) {
    perfectSubmission[qNum] = ansKeysMap[qNum].primary_answer;
  } else if (q.section_number === 3) {
    perfectSubmission[qNum] = ansKeysMap[qNum].correct_choice_key;
  } else if (q.section_number === 4) {
    perfectSubmission[qNum] = rubricsMap[qNum].model_answer;
  }
}

const fullResult = gradeCompleteEvaluation(perfectSubmission, questions, ansKeysMap, rubricsMap, 70.0);
console.log('\n--- Full Evaluation Simulation ---');
console.log('Sec 1 Score (max 20):', fullResult.sec1_score);
console.log('Sec 2 Score (max 20):', fullResult.sec2_score);
console.log('Sec 3 Score (max 40):', fullResult.sec3_score);
console.log('Sec 4 Score (max 20):', fullResult.sec4_score);
console.log('Total Score (max 100):', fullResult.total_score);
console.log('Percentage:', fullResult.percentage + '%');
console.log('Passed:', fullResult.passed === 1 ? 'PASS' : 'FAIL');

if (fullResult.total_score === 100 && fullResult.passed === 1) {
  console.log('\nSUCCESS: 100/100 points validated across all 4 sections!');
} else {
  console.error('\nFAILURE: Score was', fullResult.total_score);
  process.exit(1);
}
