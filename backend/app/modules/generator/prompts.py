"""
Role-based prompt templates for the two-mode workflow.

Mode A — Optimized Pipeline (3 sequential LLM calls):
  Stage 1  build_ba_prompt()      → GPT-4o  as Senior Business Analyst / QA Architect
  Stage 2  build_qa_prompt()      → Gemini  as Expert QA Engineer
  Stage 3  build_review_prompt()  → Claude  as Senior QA Lead (final review)

Mode B — Research (N parallel LLM calls):
  build_research_prompt()         → any model, combined BA + QA role

Rules:
  - No imports from any other app module — pure string construction only.
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MODE A — OPTIMIZED PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: GPT-4o as Senior Business Analyst / QA Architect ─────────────────
# (unchanged — GPT-4o phân tích nghiệp vụ đang tốt, không cần sửa)

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

## Coverage Requirements (MANDATORY)
Generate test cases until ALL of the following minimums are met:
- At least 25% of test cases must be Negative category
- At least 3 Security test cases (SQL injection, XSS, authentication bypass,
  brute-force, data exposure — pick the most relevant for this feature)
- At least 2 Performance test cases (response time under load, concurrent users)
- Every boundary value in the feature constraints must have its own test case
  (e.g. if max = 5MB, generate TC for exactly 5MB, 5MB+1byte, and just below)
- Every exception_flow in the analysis must map to at least 1 Negative TC

## Test Data Requirements (STRICT)
Every test case MUST have test_data populated with domain-specific realistic values.
Apply these rules without exception:
- Emails      → "nguyenvana@gmail.com", "tranthib@yahoo.com" (never "test@test.com")
- Passwords   → "Matkhau@2024", "Abcde12345!" (never "password" or "abc123")
- Phone       → Vietnamese format "0912345678", "0398765432"
- Money/price → realistic VND "1.500.000", "250.000", "99.000" (never "100" or "1000")
- File names  → "avatar_nguyen.jpg", "profile_2024.png" (never "test.jpg")
- IDs/codes   → "ORD-20240515-001", "USR-00042" (never "id123")
- Usernames   → "Nguyễn Văn An", "Trần Thị Bích" (real Vietnamese names)
- Dates       → "15/05/2024", "2024-12-31" (never "01/01/2000")
If a field in test_data truly has no input (e.g. a read-only display test),
use {{}} — but this must be genuinely justified, not used to skip data.

## Precondition Requirements (STRICT)
Each test case must list ALL system states required before execution:
- User authentication state ("Người dùng đã đăng nhập với tài khoản nguyenvana@gmail.com")
- Relevant data that must exist in the system
- Feature/page the user must be on
- Any prior action required (e.g. "Giỏ hàng có 2 sản phẩm với tổng tiền 350.000 VND")
Never use a single generic precondition like "User is logged in" alone if
more context is needed for the test to be reproducible.

## Step Requirements (STRICT)
Each step must be atomic — exactly ONE action per step:
- BAD:  "1. Nhập email và mật khẩu rồi nhấn đăng nhập"
- GOOD: "1. Nhập 'nguyenvana@gmail.com' vào trường Email
         2. Nhập 'Matkhau@2024' vào trường Mật khẩu
         3. Nhấn nút Đăng nhập"
Always include the exact value being entered in the step text itself.

## Expected Result Requirements (STRICT)
Each expected_result must describe TWO things:
1. The UI response the tester can observe (message shown, page navigated to,
   element state changed)
2. The system state change that occurred (data saved, status updated, log created)
- BAD:  "Đăng nhập thành công"
- GOOD: "Hệ thống chuyển hướng người dùng đến trang chủ và hiển thị tên
         'Nguyễn Văn An' ở góc trên phải. Phiên đăng nhập được tạo và
         access token được lưu trong localStorage."

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

## Self-Review Before Output
Before returning, verify ALL of the following — fix any violations before outputting:
- [ ] No two test cases have the same title or test the same condition
- [ ] Every step is atomic (one action only)
- [ ] Every test_data has realistic domain-specific values (no placeholders)
- [ ] Every preconditions list has at least 2 items with specific values
- [ ] Every expected_result describes both UI response AND system state change
- [ ] At least 25% are Negative category
- [ ] At least 3 Security test cases exist
- [ ] At least 2 Performance test cases exist
- [ ] total_count equals exactly the number of items in test_cases
- [ ] If input has flagged ambiguities, add a note in the relevant expected_result

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
    "a generated test suite before delivery to the development team. "
    "Your standard is higher than the generator — every test case you output "
    "must be immediately executable by a junior QA engineer without clarification."
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

### Phase 1 — Coverage Gap Analysis
Mentally map ALL test scenarios the feature requires across these dimensions:
- Functional: happy paths, alternative flows, edge cases
- Negative: invalid input, missing data, boundary violations, error handling
- Security: injection attacks (SQL, XSS), authentication bypass, brute-force
  protection, data exposure, rate limiting, session management
- UI/UX: real-time validation, error message placement, countdown timers,
  disabled states, responsive layout
- Performance: response time, concurrent users, load handling
- Boundary: just-inside and just-outside limits for ALL numeric/size/time constraints

Identify which dimensions are missing or undercovered in the raw suite.

### Phase 2 — Quality Upgrade
For EVERY existing test case, check and fix ALL of the following:

**Preconditions:**
- Must list ALL system states required (not just "user is logged in")
- Must use specific values: account email, data that must pre-exist, page location
- Minimum 2 precondition items per test case; add missing ones

**Steps:**
- Each step must be atomic — exactly ONE action per step
- Split any step that performs 2+ actions
- Steps that enter data must include the exact value inline
  (e.g. "Nhập 'nguyenvana@gmail.com' vào trường Email", not "Nhập email hợp lệ")

**Expected Result:**
- Must explicitly state BOTH:
  (a) what the tester sees on the UI (message, redirect, element state)
  (b) what changed in the system (data persisted, status updated, log created)
- If either (a) or (b) is missing, add it

**Test Data:**
- Replace ALL generic values with domain-specific realistic ones:
  emails → real format Vietnamese emails
  passwords → format meeting the feature's constraints
  amounts → realistic VND values
  names → real Vietnamese full names
  files → descriptive filenames with correct extension
- test_data must be {{}} ONLY when the test case genuinely has no input fields

### Phase 3 — Deduplication
- Remove exact duplicates (identical title + same condition tested)
- Merge near-duplicates: keep the more detailed one, discard the weaker
- A test case is NOT a duplicate just because it tests the same field —
  different boundary values or different error conditions are distinct TCs

### Phase 4 — Gap Filling
Add new test cases for ALL coverage gaps identified in Phase 1.
No upper limit on how many to add — add as many as the feature needs.
Priority guidelines:
- Security gaps → High priority, always add
- Missing boundary cases (just-inside / just-outside) → Medium priority
- Missing UI/UX validation behaviors → Medium or Low priority
- Missing error handling paths → Medium priority
Before adding each new TC, confirm: does a similar TC already exist?
If yes, upgrade the existing one instead of adding a duplicate.

### Phase 5 — Standardization
- Re-index all test_case_id sequentially: TC_001, TC_002, TC_003...
- Normalize priority: only "High | Medium | Low" — no other values
- Validate category: only "Functional | UI/UX | Negative | Security | Performance"
- Ensure steps are numbered strings: "1. ...", "2. ..."
- Verify total_count equals exactly the number of items in test_cases

### Phase 6 — Final Quality Gate
Before outputting, confirm ALL of the following are true:
- [ ] Every test case is immediately executable by a junior QA without clarification
- [ ] No step says "enter valid data" — all steps specify the exact value
- [ ] No expected_result is a single short phrase — all describe UI + system state
- [ ] No test_data contains placeholder values like "test", "abc", "123", "example"
- [ ] At least 25% of test cases are Negative category
- [ ] Security and Performance categories each have at least 3 test cases
- [ ] total_count matches actual array length

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
- Do NOT remove test cases without a clear reason (duplicate or genuinely redundant)
- Do NOT downgrade a test case's quality to save tokens — completeness is required
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
# (unchanged — Research mode dùng để so sánh độc lập từng model, không sửa)

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
    """Stage 1 — GPT-4o as Senior Business Analyst / QA Architect."""
    return _BA_TMPL.format(requirement=requirement, language=language)


def build_qa_prompt(ba_spec: str, language: str) -> str:
    """Stage 2 — Gemini as Expert QA Engineer (takes BA analysis as input)."""
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


def build_research_system(language: str) -> str:
    """Research mode system prompt — includes language to ensure GPT-4o honours it."""
    return (
        "You are an expert QA engineer. Your task is to analyze a feature description "
        f"and generate a complete test suite in a single pass. "
        f"All human-readable content in your output MUST be written in {language}."
    )


def build_research_prompt(requirement: str, language: str) -> str:
    """Research mode — combined BA + QA, fully independent generation."""
    return _RESEARCH_TMPL.format(requirement=requirement, language=language)