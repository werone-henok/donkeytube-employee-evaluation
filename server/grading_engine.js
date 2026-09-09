/**
 * Secure Server-Side Grading Engine for DonkeyTube Employee Evaluation
 * Handles all 4 sections with deterministic scoring rules, normalizations, and rubrics.
 */

function normalizeText(text, options = {}) {
  if (text === null || text === undefined) return '';
  let str = String(text);

  if (options.case_sensitive === false || options.case_sensitive === 0) {
    str = str.toLowerCase();
  }

  if (options.punctuation_normalize !== false) {
    // Strip common punctuation from Amharic (፡, ።, ፣, ፤, ፥) and standard (!, ?, ., ,, -, _, /, (, ))
    str = str.replace(/[፡።፣፤፥\.\,\-\_\/\(\)\'\"\:\;\[\]\{\}\!\?]/g, ' ');
  }

  if (options.whitespace_normalize !== false) {
    // Collapse multi-spaces and trim
    str = str.replace(/\s+/g, ' ').trim();
  }

  return str;
}

/**
 * Grade Section 1: True / False
 */
function gradeTrueFalse(submitted, answerKey) {
  if (!submitted || typeof submitted !== 'string') {
    return { is_correct: false, points: 0, feedback: 'No answer submitted' };
  }

  const rawSub = submitted.trim().toLowerCase();
  const rawOfficial = (answerKey.primary_answer || answerKey.official_answer || '').trim().toLowerCase();
  const isOfficialTrue = rawOfficial.includes('እውነት') || rawOfficial.includes('true');

  const trueTokens = ['እውነት', 'true', 't', '1'];
  const falseTokens = ['ሐሰት', 'false', 'f', '0'];

  let candidateBool = null;
  if (trueTokens.includes(rawSub) || rawSub.includes('እውነት')) candidateBool = true;
  else if (falseTokens.includes(rawSub) || rawSub.includes('ሐሰት')) candidateBool = false;

  const isCorrect = (candidateBool === isOfficialTrue);
  return {
    is_correct: isCorrect,
    points: isCorrect ? 1 : 0,
    matched_value: submitted,
    feedback: isCorrect ? 'Correct' : 'Incorrect'
  };
}

/**
 * Grade Section 2: Fill in the Blank
 */
function gradeFillInBlank(submitted, answerKey) {
  if (!submitted || !String(submitted).trim()) {
    return { is_correct: false, points: 0, feedback: 'No answer submitted' };
  }

  const opts = {
    case_sensitive: answerKey.case_sensitive === 1,
    whitespace_normalize: answerKey.whitespace_normalize !== 0,
    punctuation_normalize: answerKey.punctuation_normalize !== 0
  };

  const normSubmitted = normalizeText(submitted, opts);

  // Accepted answers list
  let accepted = [];
  try {
    accepted = typeof answerKey.accepted_answers_json === 'string'
      ? JSON.parse(answerKey.accepted_answers_json)
      : (answerKey.accepted_answers || []);
  } catch (e) {
    accepted = [];
  }

  // Also include primary, English and Amharic equivalents
  if (answerKey.primary_answer) accepted.push(answerKey.primary_answer);
  if (answerKey.english_equivalent) accepted.push(answerKey.english_equivalent);
  if (answerKey.amharic_equivalent) accepted.push(answerKey.amharic_equivalent);

  let isMatch = false;
  let matchedRule = '';

  for (const acc of accepted) {
    if (!acc) continue;
    const normAcc = normalizeText(acc, opts);

    // Exact normalized equality
    if (normSubmitted === normAcc) {
      isMatch = true;
      matchedRule = `Exact match with "${acc}"`;
      break;
    }

    // Substring / containment check for multi-word or compound terms (e.g. 'Time-bound', 'Customer Service')
    if (normAcc.length >= 4 && (normSubmitted.includes(normAcc) || normAcc.includes(normSubmitted))) {
      // If reasonable token match
      isMatch = true;
      matchedRule = `Semantic token match with "${acc}"`;
      break;
    }
  }

  return {
    is_correct: isMatch,
    points: isMatch ? 1 : 0,
    matched_rule: matchedRule,
    feedback: isMatch ? 'Correct' : 'Incorrect'
  };
}

/**
 * Grade Section 3: Multiple Choice (2 points each)
 */
function gradeMultipleChoice(submitted, answerKey) {
  if (!submitted) {
    return { is_correct: false, points: 0, feedback: 'No option selected' };
  }

  const cleanSub = String(submitted).trim();
  const officialKey = (answerKey.correct_choice_key || '').trim();

  // Candidate might submit either the key ('ለ') or 'ለ)' or the full choice text
  const isCorrect = (
    cleanSub === officialKey ||
    cleanSub.startsWith(officialKey + ')') ||
    cleanSub.startsWith(officialKey + ' ') ||
    (answerKey.official_answer && cleanSub.includes(officialKey))
  );

  return {
    is_correct: isCorrect,
    points: isCorrect ? 2 : 0,
    selected_choice: cleanSub,
    feedback: isCorrect ? 'Correct' : 'Incorrect'
  };
}

/**
 * Grade Section 4: Essay / Short Answer (1 point each)
 * Evaluates candidate text against deterministic rubric concepts and keywords.
 */
function gradeShortAnswer(submitted, rubric) {
  if (!submitted || !String(submitted).trim()) {
    return {
      is_correct: false,
      points: 0,
      matched_keywords: [],
      matched_concepts: 0,
      grading_mode: rubric ? rubric.grading_mode : 'AUTO',
      feedback: 'No answer submitted'
    };
  }

  if (!rubric) {
    return { is_correct: false, points: 0, feedback: 'No rubric configured' };
  }

  const subText = String(submitted).toLowerCase();

  let keywords = [];
  try {
    keywords = typeof rubric.accepted_keywords_json === 'string'
      ? JSON.parse(rubric.accepted_keywords_json)
      : (rubric.accepted_keywords || []);
  } catch (e) {
    keywords = [];
  }

  let requiredConcepts = [];
  try {
    requiredConcepts = typeof rubric.required_concepts_json === 'string'
      ? JSON.parse(rubric.required_concepts_json)
      : (rubric.required_concepts || []);
  } catch (e) {
    requiredConcepts = [];
  }

  const minConcepts = rubric.min_concepts || 1;
  const matchedKeywords = [];

  for (const kw of keywords) {
    if (kw && subText.includes(String(kw).toLowerCase().trim())) {
      matchedKeywords.push(kw);
    }
  }

  // Count concept matches
  let conceptHits = 0;
  for (const c of requiredConcepts) {
    // Check if any word in the concept is present
    const cTokens = c.split(/[\/\s\(\)]+/).filter(t => t.length > 2);
    const hasToken = cTokens.some(tok => subText.includes(tok.toLowerCase()));
    if (hasToken) {
      conceptHits++;
    }
  }

  // Combine hits
  const totalScoreHits = Math.max(matchedKeywords.length > 0 ? 1 : 0, conceptHits);
  const isSatisfied = (totalScoreHits >= minConcepts || matchedKeywords.length >= 2);

  const points = isSatisfied ? 1 : (matchedKeywords.length === 1 ? 0.5 : 0);
  const isFullCredit = points >= 1;

  return {
    is_correct: isFullCredit,
    points: points,
    matched_keywords: matchedKeywords,
    matched_concepts: conceptHits,
    min_required: minConcepts,
    grading_mode: rubric.grading_mode || 'AUTO',
    requires_manual_review: rubric.grading_mode === 'MANUAL_REVIEW' || (!isFullCredit && points > 0),
    feedback: isFullCredit ? 'Full credit awarded via rubric' : (points > 0 ? 'Partial credit (flagged for review)' : 'Insufficient concepts')
  };
}

/**
 * Grade Full Evaluation Attempt
 * Takes submitted answers object: { [question_number]: value }
 * Evaluates all 80 questions and returns section totals, percentages, and detailed breakdown.
 */
function gradeCompleteEvaluation(submittedAnswersMap, questionsList, answerKeysMap, rubricsMap, passThreshold = 70.0) {
  let sec1_score = 0;
  let sec2_score = 0;
  let sec3_score = 0;
  let sec4_score = 0;

  const itemResults = [];

  for (const q of questionsList) {
    const qNum = q.question_number;
    const ansKey = answerKeysMap[qNum] || {};
    const rubric = rubricsMap[qNum] || null;
    const candidateAnswer = submittedAnswersMap[qNum] !== undefined ? submittedAnswersMap[qNum] : '';

    let gradeRes = { is_correct: false, points: 0, feedback: '' };

    if (q.section_number === 1) {
      gradeRes = gradeTrueFalse(candidateAnswer, ansKey);
      sec1_score += gradeRes.points;
    } else if (q.section_number === 2) {
      gradeRes = gradeFillInBlank(candidateAnswer, ansKey);
      sec2_score += gradeRes.points;
    } else if (q.section_number === 3) {
      gradeRes = gradeMultipleChoice(candidateAnswer, ansKey);
      sec3_score += gradeRes.points;
    } else if (q.section_number === 4) {
      gradeRes = gradeShortAnswer(candidateAnswer, rubric);
      sec4_score += gradeRes.points;
    }

    itemResults.push({
      question_id: q.id,
      question_number: qNum,
      section_number: q.section_number,
      submitted_answer: candidateAnswer,
      awarded_points: gradeRes.points,
      max_points: q.points,
      is_correct: gradeRes.is_correct ? 1 : 0,
      grading_details: gradeRes
    });
  }

  const total_score = sec1_score + sec2_score + sec3_score + sec4_score;
  const percentage = Math.round((total_score / 100.0) * 1000) / 10.0;
  const passed = percentage >= passThreshold ? 1 : 0;

  return {
    sec1_score,
    sec2_score,
    sec3_score,
    sec4_score,
    total_score,
    percentage,
    passed,
    pass_threshold: passThreshold,
    item_results: itemResults
  };
}

module.exports = {
  normalizeText,
  gradeTrueFalse,
  gradeFillInBlank,
  gradeMultipleChoice,
  gradeShortAnswer,
  gradeCompleteEvaluation
};
