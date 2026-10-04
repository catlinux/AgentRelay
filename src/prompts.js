// Prompts para el agente ejecutor.
// Se escriben en inglés porque es el idioma en el que los modelos siguen
// instrucciones de forma más fiable; el contenido de la tarea se respeta tal cual.

const SELF_REVIEW_DIFF_CHARS = 20000;

function section(title, body) {
  return body ? `## ${title}\n${body}\n` : '';
}

function bullets(items) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '';
}

function commands(items) {
  return items.length ? items.map((item) => `- \`${item}\``).join('\n') : '';
}

function taskSections(task, validationCommands) {
  return [
    section('Objective', task.objective),
    section('Context', task.context),
    section('Relevant files or areas', bullets(task.files)),
    section('Constraints', bullets(task.constraints)),
    section('Do not modify', bullets(task.doNotModify)),
    section('Acceptance criteria', bullets(task.acceptanceCriteria)),
    section(
      'Validation commands',
      validationCommands.length
        ? `Run these from the repository root; they must pass:\n${commands(validationCommands)}`
        : '',
    ),
  ].join('\n');
}

const RULES = `## Rules
- Keep the changes minimal and focused on the objective. Do not modify unrelated files.
- Do not create git commits, branches, stashes or tags, and never push.
- Do not read or modify anything inside the \`.agentrelay/\` directory, except the instruction file you were given.
- On Windows, if PowerShell blocks \`npm.ps1\` (execution policy), run \`npm.cmd\` instead (for example \`npm.cmd test\`) and do not report it as an issue.
- If you cannot complete the task (missing information, unclear requirements, something outside your reach), stop and report status "blocked" instead of guessing.
`;

const INLINE_SELF_REVIEW = `## Self-review before finishing
Before returning, check your own work, proportionately to the size of the change:
1. Every acceptance criterion is met.
2. The validation commands pass (run them if you have not already).
3. No obvious errors, regressions or leftover debugging code.
4. No files were changed unnecessarily.
Fix any problem you can fix yourself before returning. Do not repeat checks that already passed.
`;

export const REPORT_INSTRUCTIONS = `## Final report
End your final answer with a JSON block in exactly this format (it is parsed automatically):

\`\`\`json
{
  "status": "done",
  "summary": "One or two sentences describing what you did.",
  "filesChanged": ["path/to/file"],
  "checks": [{ "command": "npm test", "result": "pass" }],
  "issues": [],
  "questions": [],
  "needsEscalation": false
}
\`\`\`

- status: "done" (task complete), "partial" (incomplete) or "blocked" (cannot continue without help).
- checks[].result: "pass", "fail" or "not-run".
- issues: problems you know remain. questions: anything that needs clarification.
- needsEscalation: true if the task exceeds what you can do reliably.
`;

function formatValidations(validations, { onlyFailed = false } = {}) {
  const list = onlyFailed ? validations.filter((v) => !v.passed) : validations;
  if (!list.length) return '';
  return list
    .map((v) => {
      const state = v.timedOut ? 'TIMED OUT' : v.passed ? 'PASSED' : `FAILED (exit ${v.exitCode})`;
      const output = v.output ? `\n\`\`\`\n${v.output}\n\`\`\`` : '';
      return `- \`${v.command}\`: ${state}${output}`;
    })
    .join('\n');
}

function header(phase, title) {
  return `AgentRelay-Phase: ${phase}\n\n# ${title}\n`;
}

export function buildImplementPrompt(task, { validationCommands, selfReview }) {
  return [
    header('implement', `Delegated task: ${task.title}`),
    'You are the executor of a delegated software development task. Work directly in the current repository.\n',
    taskSections(task, validationCommands),
    RULES,
    selfReview === 'none' ? '' : INLINE_SELF_REVIEW,
    REPORT_INSTRUCTIONS,
  ].join('\n');
}

export function buildFixPrompt(task, { validationCommands, selfReview, feedback, validations, scopeViolations }) {
  const problems = [
    feedback ? feedback.trim() : '',
    scopeViolations?.length
      ? `These files must not be modified; restore them to their original state:\n${bullets(scopeViolations)}`
      : '',
  ].filter(Boolean).join('\n\n');

  return [
    header('fix', `Correction for task: ${task.title}`),
    'A previous attempt at this task needs corrections. Its changes are still in the working tree: build on them instead of starting over.\n',
    section('Problems to fix', problems),
    section('Failing validations', formatValidations(validations || [], { onlyFailed: true })),
    '# Original task\n',
    taskSections(task, validationCommands),
    RULES,
    selfReview === 'none' ? '' : INLINE_SELF_REVIEW,
    REPORT_INSTRUCTIONS,
  ].join('\n');
}

export function buildSelfReviewPrompt(task, { validationCommands, changedFiles, diff, validations }) {
  const truncated = diff.length > SELF_REVIEW_DIFF_CHARS;
  const diffText = truncated ? `${diff.slice(0, SELF_REVIEW_DIFF_CHARS)}\n... (diff truncated; read the files for the rest)` : diff;
  return [
    header('self-review', `Self-review of task: ${task.title}`),
    'You implemented the task below. Before it is handed over for acceptance, review the result critically.\n',
    '# Original task\n',
    taskSections(task, validationCommands),
    section('Changed files', bullets(changedFiles.map((f) => `${f.status} ${f.path}`))),
    section('Diff', `\`\`\`diff\n${diffText}\n\`\`\``),
    section('Validation results', formatValidations(validations) || 'No validation commands are configured.'),
    `## What to check
- The requirements and every acceptance criterion are met.
- No obvious errors, regressions or inconsistent changes.
- Tests, build and lint pass where validation commands exist.
- No files were modified unnecessarily.
- Nothing would prevent accepting the task.

If you find problems you can fix, fix them now and re-run the relevant validations.
If everything is correct, do not change anything.
`,
    RULES,
    REPORT_INSTRUCTIONS,
  ].join('\n');
}
