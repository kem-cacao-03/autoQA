"""
Role-based prompt templates for the two-mode workflow.

Mode A — Optimized Pipeline (3 sequential LLM calls):
  Stage 1  build_ba_prompt()      → Claude   as Senior Business Analyst / QA Architect
  Stage 2  build_qa_prompt()      → GPT-4o   as Expert QA Engineer
  Stage 3  build_review_prompt()  → Gemini   as Senior QA Lead (final review)

Mode B — Research (N parallel LLM calls):
  build_research_prompt()         → any model, combined BA + QA role

Rules:
  - No imports from any other app module — pure string construction only.
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MODE A — OPTIMIZED PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: GPT-4o as Senior Business Analyst / QA Architect ─────────────────

SYSTEM_BA = "You are a senior business analyst and QA architect."

_BA_TMPL = """\
Your job is to analyze a natural language feature description and extract only \
the essential information needed for test case generation.

## Output Language
All values in your JSON output must be written in: {language}
(Keys must always remain in English)

## Your Tasks
Analyze the feature description and extract:
1. Business rules — explicit and implicit rules that govern the feature
2. Constraints — validation rules, limits, permissions, data formats
3. User flows — all paths a user can take through the feature
4. Test scenarios — high-level scenario names grouped by category
5. Ambiguities — unclear requirements that may affect test coverage

## Output Format (JSON)
{{
  "business_rules": [
    "One short sentence per rule"
  ],
  "constraints": [
    "One short sentence per constraint"
  ],
  "flows": {{
    "happy_paths": ["One short sentence per flow"],
    "alternative_flows": ["One short sentence per flow"],
    "exception_flows": ["One short sentence per flow"]
  }},
  "scenarios": {{
    "functional": ["Scenario name only"],
    "boundary": ["Scenario name only"],
    "negative": ["Scenario name only"],
    "ui_ux": [],
    "security": [],
    "performance": []
  }},
  "ambiguities": [
    "One short question per ambiguity"
  ]
}}

## Rules
- Each array item must be 1 short sentence only — no nested objects, no bullet points
- Use [] for categories with no applicable scenarios
- Do NOT generate detailed test cases — scenario names only
- Do NOT include feature summary, entities, or any field outside the schema above
- Be exhaustive on scenarios — missing a scenario here = missing test coverage later
- Output ONLY the JSON object. No explanation, no markdown code blocks.
  Start your response with "{{" and end with "}}"

## Feature Description:
{requirement}\
"""


# ── Stage 2: Gemini as Expert QA Engineer ────────────────────────────────────

SYSTEM_QA = "You are an expert QA engineer specializing in comprehensive test case design."

_QA_TMPL = """\
You will receive a structured feature analysis and must generate a complete \
test suite covering all scenarios.

## Output Language
All human-readable values (title, preconditions, steps, expected_result,
test_data values) must be written in: {language}
(JSON keys must always remain in English)

## Input
A JSON object containing feature analysis and scenario outlines.

## Your Tasks
For EACH scenario in the outline, generate detailed test cases covering:
- All happy paths
- All boundary and edge cases (min, max, just-inside, just-outside)
- All negative and error cases
- UI/UX flows (if present in outline)
- Security scenarios (if present in outline)
- Performance hints (if present in outline)

## Quantity Guideline
- Aim for quality over quantity
- Maximum 25 test cases unless feature is very complex
- Prefer 1 well-written test case over 3 redundant ones
- If scenarios exceed 25, prioritize: High priority first, then Medium, then Low

## Output Format (JSON)
{{
  "test_suite_name": "Short feature name",
  "description": "One sentence describing the scope of this test suite",
  "test_cases": [
    {{
      "test_case_id": "TC_001",
      "title": "...",
      "priority": "High | Medium | Low",
      "category": "Functional | UI/UX | Negative | Security | Performance",
      "preconditions": ["..."],
      "steps": ["1. ...", "2. ...", "3. ..."],
      "expected_result": "...",
      "test_data": {{"field": "value"}}
    }}
  ],
  "total_count": 0
}}

## Priority Rules
- High   → Core happy paths, critical failures, security breaches
- Medium → Alternative flows, important edge cases
- Low    → Minor UI details, low-impact edge cases

## Category Rules
- Functional  → Business logic, data processing, CRUD operations
- UI/UX       → Layout, navigation, responsiveness, usability
- Negative    → Invalid input, unauthorized access, error handling
- Security    → Authentication, authorization, injection, data exposure
- Performance → Load time, response time, concurrent users

## Format Rules
- steps: array of strings, each formatted as "1. action", "2. action"...
- test_data: key-value with specific realistic values, {{}} if not applicable
- expected_result: one clear paragraph describing the verifiable outcome
- total_count: must equal exactly the number of items in test_cases array
- At least 20% of test cases must be Negative category
- Use specific realistic test data — never use placeholders like "abc123" or "test@test.com"
- If input has flagged ambiguities, generate for the most likely interpretation
  and add a note in expected_result referencing the ambiguity

## Self-Review Before Output
Before returning, review your output and:
- Remove duplicate or near-duplicate test cases
- Ensure all steps are atomic (one action per step)
- Verify total_count matches actual array length
- Replace all placeholder test data with realistic values
- Confirm no test case has vague expected_result
- Confirm at least 20% are Negative category

## IMPORTANT
Your response must be ONLY the JSON object.
No explanation, no markdown code blocks, no preamble.
Start your response with "{{" and end with "}}"

## Input Analysis:
{ba_spec}\
"""


# ── Stage 3: Claude as Senior QA Lead (final review & standardization) ────────

SYSTEM_REVIEWER = (
    "You are a senior QA lead performing final review and standardization of "
    "a generated test suite before delivery to the development team."
)

_REVIEW_TMPL = """\
## Output Language
All human-readable values (title, preconditions, steps, expected_result,
test_data values) must be written in: {language}
(JSON keys must always remain in English)

## Inputs
You will receive:
1. Original feature description (user's raw input)
2. Raw test suite JSON (from generator)

## Your Tasks

### Phase 1 — Quality Review
- Remove exact duplicates
- Merge near-duplicates → keep the more detailed one
- Identify and fill coverage gaps vs the feature description
- Add missing critical test cases if found (High priority flows only)
- Fix any vague steps or unverifiable expected results

### Phase 2 — Standardization
- Re-index all test_case_id sequentially: TC_001, TC_002, TC_003...
- Normalize priority: only allow "High | Medium | Low"
- Validate category: only allow "Functional | UI/UX | Negative | Security | Performance"
- Ensure steps are formatted as numbered strings: "1. ...", "2. ..."
- Ensure test_data uses realistic specific values, not placeholders
- Verify total_count matches the actual number of test cases

### Phase 3 — Output
Produce the finalized test suite in the exact schema below.

## Output Format (JSON)
{{
  "test_suite_name": "Short feature name",
  "description": "One sentence describing the scope of this test suite",
  "test_cases": [
    {{
      "test_case_id": "TC_001",
      "title": "...",
      "priority": "High | Medium | Low",
      "category": "Functional | UI/UX | Negative | Security | Performance",
      "preconditions": ["..."],
      "steps": ["1. ...", "2. ...", "3. ..."],
      "expected_result": "...",
      "test_data": {{"field": "value"}}
    }}
  ],
  "total_count": 0
}}

## Rules
- Do NOT remove test cases without a clear reason (duplicate or redundant)
- Only add new test cases for High priority gaps — do not over-generate
- total_count must equal exactly len(test_cases)
- Output ONLY the JSON object. No explanation, no markdown code blocks.
  Start your response with "{{" and end with "}}"

## Input 1 — Original Feature Description:
{requirement}

## Input 2 — Raw Test Suite:
{qa_cases}\
"""


# ═══════════════════════════════════════════════════════════════════════════════
# MODE B — RESEARCH (combined BA + QA role, each model works independently)
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_RESEARCH = "You are an expert QA engineer. Your task is to analyze a feature description and generate a complete test suite in a single pass."

_RESEARCH_TMPL = """\
## Output Language
All human-readable values must be written in: {language}
(JSON keys must always remain in English)

## Your Tasks
Work through these steps internally (do NOT output intermediate steps):

1. Analyze the feature description:
   - Identify entities, business rules, and constraints
   - Map all user flows: happy paths, alternative flows, error flows
   - Detect boundary conditions and edge cases

2. Generate comprehensive test cases covering:
   - All happy paths
   - Boundary / edge cases (min, max, just-inside, just-outside)
   - Negative / error cases (invalid input, missing data, wrong permissions)
   - UI/UX scenarios (if applicable)
   - Security scenarios (if applicable)
   - Performance hints (if applicable)

3. Self-review before outputting:
   - Remove duplicates
   - Ensure at least 20% of test cases are Negative category
   - Verify total_count matches actual number of test cases
   - Replace any placeholder test data with specific realistic values

## Output Format (JSON)
{{
  "test_suite_name": "Short feature name",
  "description": "One sentence describing the scope of this test suite",
  "test_cases": [
    {{
      "test_case_id": "TC_001",
      "title": "...",
      "priority": "High | Medium | Low",
      "category": "Functional | UI/UX | Negative | Security | Performance",
      "preconditions": ["..."],
      "steps": ["1. ...", "2. ...", "3. ..."],
      "expected_result": "...",
      "test_data": {{"field": "value"}}
    }}
  ],
  "total_count": 0
}}

## Priority Rules
- High   → Core happy paths, critical failures, security breaches
- Medium → Alternative flows, important edge cases
- Low    → Minor UI details, low-impact edge cases

## Category Rules
- Functional  → Business logic, data processing, CRUD operations
- UI/UX       → Layout, navigation, responsiveness, usability
- Negative    → Invalid input, unauthorized access, error handling
- Security    → Authentication, authorization, injection, data exposure
- Performance → Load time, response time, concurrent users

## Format Rules
- steps: array of strings, each formatted as "1. action", "2. action"...
- test_data: key-value with specific realistic values (real email, real phone number format,
  real boundary numbers...), use {{}} if not applicable
- expected_result: one clear paragraph describing the verifiable outcome
- total_count: must equal exactly the number of items in test_cases

## IMPORTANT
Your response must be ONLY the JSON object.
No explanation, no markdown code blocks, no preamble.
Start your response with "{{" and end with "}}"

## Feature Description:
{requirement}\
"""


# ═══════════════════════════════════════════════════════════════════════════════
# Builder functions (public API of this module)
# ═══════════════════════════════════════════════════════════════════════════════


def build_ba_prompt(requirement: str, language: str) -> str:
    """Stage 1 — Claude as Senior Business Analyst / QA Architect."""
    return _BA_TMPL.format(requirement=requirement, language=language)


def build_qa_prompt(ba_spec: str, language: str) -> str:
    """Stage 2 — GPT-4o as Expert QA Engineer (takes BA analysis as input)."""
    return _QA_TMPL.format(ba_spec=ba_spec, language=language)


def build_review_prompt(
    requirement: str,
    qa_cases: str,
    language: str,
) -> str:
    """Stage 3 — Claude as Senior QA Lead (final review & standardization)."""
    return _REVIEW_TMPL.format(
        requirement=requirement,
        qa_cases=qa_cases,
        language=language,
    )


def build_research_prompt(requirement: str, language: str) -> str:
    """Research mode — combined BA + QA, fully independent generation."""
    return _RESEARCH_TMPL.format(requirement=requirement, language=language)
