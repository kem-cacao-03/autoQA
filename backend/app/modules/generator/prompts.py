"""
Role-based prompt templates for the two-mode workflow.

Mode A — Optimized Pipeline (3 sequential LLM calls):
  Stage 1  build_ba_prompt()      → Gemini    as Senior Business Analyst
  Stage 2  build_qa_prompt()      → GPT-4o    as Senior QA Engineer
  Stage 3  build_review_prompt()  → Claude    as Elite Quality Auditor

Mode B — Research (N parallel LLM calls):
  build_research_prompt()         → any model, combined BA + QA role

Rules:
  - No imports from any other app module — pure string construction only.
"""

# ═══════════════════════════════════════════════════════════════════════════════
# MODE A — OPTIMIZED PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Gemini as Senior Business Analyst ────────────────────────────────

SYSTEM_BA = "You are a Senior Business Analyst."

_BA_TMPL = """\
Task: Analyze the following user's functional description and extract structured \
requirements and edge cases.

User Description:
\"\"\"{requirement}\"\"\"

Analysis Process:
1. User Flow Mapping: Define the step-by-step journey.
2. Business Rules: Identify constraints (data types, length, security protocols).
3. Input Validation: List all criteria for valid/invalid data.
4. Exception Handling: Predict system failures (timeouts, database errors).

Output Requirements: Be concise and technical. NO conversational filler. \
Focus strictly on the logic tree.\
"""


# ── Stage 2: GPT-4o as Senior QA Engineer ────────────────────────────────────

SYSTEM_QA = "You are a Senior QA Engineer."

_QA_TMPL = """\
Task: Generate comprehensive test suite covering all scenarios based on the \
following Business Rules and user's functional description. Ensuring full \
coverage of business requirements, user interface (UI), performance, security, \
and usability. Adhering to the principles of accuracy, comprehensibility, \
independence, and high reusability. Returns only a single valid block of JSON data.

Business Rules:
{ba_spec}

User Description:
\"\"\"{requirement}\"\"\"

Language Output: {language}

Output Format (JSON):
{{
  "test_suite_name": "string",
  "description": "string (1 sentence max)",
  "test_cases": [
    {{
      "test_case_id": "string",
      "title": "string",
      "priority": "High | Medium | Low",
      "category": "Functional | UI/UX | Negative | Security",
      "preconditions": ["string"],
      "steps": ["string"],
      "expected_result": "string",
      "test_data": {{}}
    }}
  ],
  "total_count": 0
}}\
"""

_QA_BDD_TMPL = """\
Task: Generate comprehensive BDD scenarios based on the following Business Rules \
and user's functional description. Ensuring full coverage of all user flows, \
business rules, and edge cases. Returns only a single valid block of JSON data.

Business Rules:
{ba_spec}

User Description:
\"\"\"{requirement}\"\"\"

Language Output: {language}

Output Format (JSON):
{{
  "test_suite_name": "string",
  "description": "string (1 sentence max)",
  "test_cases": [],
  "scenarios": [
    {{
      "id": "SC-001",
      "title": "string",
      "type": "Scenario | Scenario Outline",
      "tags": ["@smoke"],
      "gherkin": "Given ...\\nWhen ...\\nThen ...",
      "examples": null
    }}
  ],
  "total_count": 0
}}\
"""

_QA_API_TMPL = """\
Task: Generate comprehensive API test cases based on the following Business Rules \
and API specification. Ensuring full coverage of all endpoints, HTTP status codes, \
and edge cases. Returns only a single valid block of JSON data.

Business Rules:
{ba_spec}

API Specification:
\"\"\"{requirement}\"\"\"

Language Output: {language}

Output Format (JSON):
{{
  "test_suite_name": "string",
  "description": "string (1 sentence max)",
  "scenarios": [],
  "test_cases": [
    {{
      "test_case_id": "string",
      "title": "string",
      "method": "GET | POST | PUT | DELETE | PATCH",
      "endpoint": "string",
      "headers": {{}},
      "request_body": null,
      "expected_status": 200,
      "expected_result": "string",
      "expected_response": {{}},
      "category": "Functional | Negative | Security",
      "priority": "High | Medium | Low"
    }}
  ],
  "total_count": 0
}}\
"""

_QA_MAP: dict[str, str] = {
    "standard": _QA_TMPL,
    "bdd": _QA_BDD_TMPL,
    "api": _QA_API_TMPL,
}


# ── Stage 3: Claude as Elite Quality Auditor ──────────────────────────────────

SYSTEM_REVIEWER = (
    "You are an Elite Quality Auditor. "
    "You will receive analysis from the Business Analyst (BA) and test cases from the QA Engineer."
)

_REVIEW_TMPL = """\
Task:
• Check if there are illogical, or unreasonable cases and correct them.
• Edge Case Mining: Consider extreme scenarios: Race Conditions (Multiple requests \
simultaneously); API Latency/Timeouts (Weak network, slow response); Security \
(Injections, token leaks via URL/Response); Data Integrity (Junk data, Unicode \
characters, SQL injection in input); UX/UI.
• Refine the terminology to meet ISO/IEEE standards for software testing.
• Eliminate duplicate or irrelevant test cases.
• Then return the final complete set of test cases, preserving the formatting.
• Returns only a single valid block of JSON data.

BA's analysis:
{ba_spec}

Test cases from QA:
{qa_cases}

Language Output: {language}

Output Format (JSON):
{{
  "test_suite_name": "string",
  "description": "string (1 sentence max)",
  "review_summary": {{
    "cases_reviewed": 0,
    "cases_added": 0,
    "cases_modified": 0,
    "coverage_score": "high | medium | low"
  }},
  "test_cases": [
    {{
      "test_case_id": "string",
      "title": "string",
      "priority": "High | Medium | Low",
      "category": "Functional | UI/UX | Negative | Security",
      "preconditions": ["string"],
      "steps": ["string"],
      "expected_result": "string",
      "test_data": {{}}
    }}
  ],
  "total_count": 0
}}\
"""


# ═══════════════════════════════════════════════════════════════════════════════
# MODE B — RESEARCH (combined BA + QA role, each model works independently)
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_RESEARCH = (
    "You are a Senior Business Analyst and an expert Software Quality Assurance Engineer "
    "specialized in designing comprehensive test suites for enterprise-level applications."
)

_RESEARCH_TMPL = """\
Task:
• Analyze the following user's functional description and extract structured \
requirements and edge cases.
• Generate a detailed set of Test Cases based on those rules. Ensuring full \
coverage of business requirements, user interface (UI), performance, security, \
and usability. Adhering to the principles of accuracy, comprehensibility, \
independence, and high reusability.
• Consider extreme scenarios: Race Conditions (Multiple requests simultaneously); \
API Latency/Timeouts (Weak network, slow response); Security (Injections, token \
leaks via URL/Response); Data Integrity (Junk data, Unicode characters, SQL \
injection in input); UX/UI.
• Refine the terminology to meet ISO/IEEE standards for software testing.
• Returns only a single valid block of JSON data.
• Analysis Process:
  1. User Flow Mapping: Define the step-by-step journey.
  2. Business Rules: Identify constraints (data types, length, security protocols).
  3. Input Validation: List all criteria for valid/invalid data.
  4. Exception Handling: Predict system failures (timeouts, database errors).

User Description:
\"\"\"{requirement}\"\"\"

Language Output: {language}

Output Format (JSON):
{{
  "test_suite_name": "string",
  "description": "string (1 sentence max)",
  "test_cases": [
    {{
      "test_case_id": "string",
      "title": "string",
      "priority": "High | Medium | Low",
      "category": "Functional | UI/UX | Negative | Security",
      "preconditions": ["string"],
      "steps": ["string"],
      "expected_result": "string",
      "test_data": {{}}
    }}
  ],
  "total_count": 0
}}\
"""


# ═══════════════════════════════════════════════════════════════════════════════
# Builder functions (public API of this module)
# ═══════════════════════════════════════════════════════════════════════════════


def build_ba_prompt(requirement: str) -> str:
    """Stage 1 — Gemini as Senior Business Analyst."""
    return _BA_TMPL.format(requirement=requirement)


def build_qa_prompt(
    requirement: str,
    ba_spec: str,
    test_type: str,
    language: str,
) -> str:
    """Stage 2 — GPT-4o as Senior QA Engineer."""
    template = _QA_MAP.get(test_type, _QA_TMPL)
    return template.format(
        requirement=requirement,
        ba_spec=ba_spec,
        language=language,
    )


def build_review_prompt(
    ba_spec: str,
    qa_cases: str,
    language: str,
) -> str:
    """Stage 3 — Claude as Elite Quality Auditor."""
    return _REVIEW_TMPL.format(
        ba_spec=ba_spec,
        qa_cases=qa_cases,
        language=language,
    )


def build_research_prompt(
    requirement: str,
    test_type: str,  # reserved — research currently uses standard format only
    language: str,
) -> str:
    """Research mode — combined BA + QA, fully independent generation."""
    return _RESEARCH_TMPL.format(
        requirement=requirement,
        language=language,
    )
